package com.rnbleperipheralmodule

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule

import org.json.JSONArray
import org.json.JSONObject

import java.util.Arrays
import java.util.UUID

@ReactModule(name = RnBlePeripheralModule.NAME)
class RnBlePeripheralModule(reactContext: ReactApplicationContext) :
  NativeRnBlePeripheralModuleSpec(reactContext) {

  companion object {
    const val NAME = "RnBlePeripheralModule"
    private const val TAG = "RnBlePeripheralModule"

    // Client Characteristic Configuration Descriptor UUID
    val CLIENT_CONFIG: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    // Manager State constants (matching iOS CBManagerState)
    const val STATE_UNKNOWN = 0
    const val STATE_RESETTING = 1
    const val STATE_UNSUPPORTED = 2
    const val STATE_UNAUTHORIZED = 3
    const val STATE_POWERED_OFF = 4
    const val STATE_POWERED_ON = 5

    // Authorization constants
    const val AUTH_NOT_DETERMINED = 0
    const val AUTH_RESTRICTED = 1
    const val AUTH_DENIED = 2
    const val AUTH_ALLOWED_ALWAYS = 3
  }

  private var bluetoothManager: BluetoothManager? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var bluetoothLeAdvertiser: BluetoothLeAdvertiser? = null
  private var bluetoothGattServer: BluetoothGattServer? = null

  // Track services before they're added to GATT server (build fully first!)
  private val pendingServices: MutableMap<String, BluetoothGattService> = LinkedHashMap()

  // Track connected/subscribed devices
  private val registeredDevices: MutableSet<BluetoothDevice> = mutableSetOf()
  private val connectedDevices: MutableMap<String, BluetoothDevice> = LinkedHashMap()

  // Track pending requests for respondToRequest
  private val pendingRequests: MutableMap<Int, PendingRequest> = LinkedHashMap()
  private var requestIdCounter = 0

  // Advertising state
  private var isCurrentlyAdvertising = false
  private var advertiseCallback: AdvertiseCallback? = null

  // Device name
  private var deviceName: String? = null

  // ============================================================================
  // Broadcast Receiver state
  // ============================================================================
  private var broadcastReceiver: BroadcastReceiver? = null
  private var registeredActions: MutableSet<String> = mutableSetOf()

  // ============================================================================
  // ✅ NEW: Sequential service registration state
  // ============================================================================

  private val serviceAddQueue: ArrayDeque<BluetoothGattService> = ArrayDeque()
  private var pendingAdvertisePromise: Promise? = null
  private var pendingAdvertiser: BluetoothLeAdvertiser? = null
  private var pendingAdvertiseSettings: AdvertiseSettings? = null
  private var pendingAdvertiseData: AdvertiseData? = null
  private var isRegisteringServicesForAdvertising: Boolean = false

  data class PendingRequest(
    val device: BluetoothDevice,
    val requestId: Int,
    val characteristic: BluetoothGattCharacteristic?,
    val isWriteRequest: Boolean
  )

  init {
    bluetoothManager = ContextCompat.getSystemService(
      reactContext,
      BluetoothManager::class.java
    )
    bluetoothAdapter = bluetoothManager?.adapter
  }

  override fun getName(): String {
    return NAME
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private fun emitDebugEvent(methodName: String) {
    val params: WritableMap = Arguments.createMap()
    params.putInt("state", getCurrentState())
    params.putString("stateDescription", "[Android] Called: $methodName")
    emitOnDidUpdateState(params)
  }

  private fun getCurrentState(): Int {
    val adapter = bluetoothAdapter ?: return STATE_UNSUPPORTED
    return when (adapter.state) {
      BluetoothAdapter.STATE_ON -> STATE_POWERED_ON
      BluetoothAdapter.STATE_OFF -> STATE_POWERED_OFF
      BluetoothAdapter.STATE_TURNING_ON, BluetoothAdapter.STATE_TURNING_OFF -> STATE_RESETTING
      else -> STATE_UNKNOWN
    }
  }

  private fun getStateDescription(state: Int): String {
    return when (state) {
      STATE_UNKNOWN -> "unknown"
      STATE_RESETTING -> "resetting"
      STATE_UNSUPPORTED -> "unsupported"
      STATE_UNAUTHORIZED -> "unauthorized"
      STATE_POWERED_OFF -> "poweredOff"
      STATE_POWERED_ON -> "poweredOn"
      else -> "unknown"
    }
  }

  private fun emitStateUpdate() {
    val state = getCurrentState()
    val params: WritableMap = Arguments.createMap()
    params.putInt("state", state)
    params.putString("stateDescription", getStateDescription(state))
    emitOnDidUpdateState(params)
  }

  private fun emitAdvertisingError(error: String) {
    val params: WritableMap = Arguments.createMap()
    params.putBoolean("success", false)
    params.putString("error", error)
    emitOnDidStartAdvertising(params)
  }

  // ============================================================================
  // ✅ NEW: Sequential service registration helpers
  // ============================================================================

  private fun clearPendingAdvertisingPipeline(keepCallback: Boolean = true) {
    serviceAddQueue.clear()
    pendingAdvertisePromise = null
    pendingAdvertiser = null
    pendingAdvertiseSettings = null
    pendingAdvertiseData = null
    isRegisteringServicesForAdvertising = false
    if (!keepCallback) advertiseCallback = null
  }

  private fun beginRegisterServicesThenAdvertise(
    advertiser: BluetoothLeAdvertiser,
    settings: AdvertiseSettings,
    data: AdvertiseData,
    promise: Promise?
  ) {
    // Make sure previous pipeline (if any) is cleared
    clearPendingAdvertisingPipeline(keepCallback = true)

    pendingAdvertisePromise = promise
    pendingAdvertiser = advertiser
    pendingAdvertiseSettings = settings
    pendingAdvertiseData = data

    if (bluetoothGattServer == null) {
      bluetoothGattServer = bluetoothManager?.openGattServer(reactApplicationContext, gattServerCallback)
    }
    if (bluetoothGattServer == null) {
      val error = "Failed to open GATT server"
      Log.e(TAG, "beginRegisterServicesThenAdvertise: $error")
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      clearPendingAdvertisingPipeline()
      return
    }

    // Important: Clear any stale services if you re-start often.
    // (Optional; keep if you want deterministic behavior)
    bluetoothGattServer?.clearServices()

    // Snapshot the services to add (already fully built in pendingServices)
    serviceAddQueue.clear()
    pendingServices.values.forEach { serviceAddQueue.add(it) }

    isRegisteringServicesForAdvertising = true

    if (serviceAddQueue.isEmpty()) {
      // If you want to allow advertising without any GATT services, you can start now.
      // For iOS central testing, it's usually better to require at least one service.
      Log.w(TAG, "No services queued; starting advertising anyway.")
      startAdvertiserNow()
      return
    }

    addNextServiceFromQueue()
  }

  private fun addNextServiceFromQueue() {
    val next = serviceAddQueue.removeFirstOrNull()
    if (next == null) {
      startAdvertiserNow()
      return
    }

    val ok = bluetoothGattServer?.addService(next) ?: false
    if (!ok) {
      val error = "addService returned false for ${next.uuid}"
      Log.e(TAG, error)
      pendingAdvertisePromise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      clearPendingAdvertisingPipeline()
    }
  }

  private fun startAdvertiserNow() {
    val advertiser = pendingAdvertiser
    val settings = pendingAdvertiseSettings
    val data = pendingAdvertiseData
    val promise = pendingAdvertisePromise

    if (advertiser == null || settings == null || data == null) {
      val error = "Internal error: missing advertising params"
      Log.e(TAG, error)
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      clearPendingAdvertisingPipeline()
      return
    }

    // Create callback once
    if (advertiseCallback == null) {
      advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
          super.onStartSuccess(settingsInEffect)
          Log.i(TAG, "Advertising started successfully")
          isCurrentlyAdvertising = true

          val params: WritableMap = Arguments.createMap()
          params.putBoolean("success", true)
          emitOnDidStartAdvertising(params)

          promise?.resolve(null)
          clearPendingAdvertisingPipeline(keepCallback = true)
        }

        override fun onStartFailure(errorCode: Int) {
          super.onStartFailure(errorCode)
          val errorMsg = when (errorCode) {
            ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
            ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
            ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
            ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
            ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
            else -> "Unknown error: $errorCode"
          }
          Log.e(TAG, "Advertising failed: $errorMsg")
          isCurrentlyAdvertising = false

          emitAdvertisingError(errorMsg)
          promise?.reject("BLE_ERROR", errorMsg)
          clearPendingAdvertisingPipeline(keepCallback = true)
        }
      }
    }

    try {
      advertiser.startAdvertising(settings, data, advertiseCallback)
    } catch (e: SecurityException) {
      val error = "Security exception: ${e.message}"
      Log.e(TAG, "startAdvertiserNow: $error")
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      clearPendingAdvertisingPipeline()
    }
  }

  // ============================================================================
  // GATT Server Callback
  // ============================================================================

  private val gattServerCallback = object : BluetoothGattServerCallback() {

    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      super.onConnectionStateChange(device, status, newState)
      Log.d(TAG, "onConnectionStateChange: device=${device.address}, status=$status, newState=$newState")

      if (newState == BluetoothProfile.STATE_CONNECTED) {
        connectedDevices[device.address] = device
        Log.i(TAG, "Device CONNECTED: ${device.address}")
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        connectedDevices.remove(device.address)
        registeredDevices.remove(device)
        Log.i(TAG, "Device DISCONNECTED: ${device.address}")
      }
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic
    ) {
      super.onCharacteristicReadRequest(device, requestId, offset, characteristic)
      Log.d(TAG, "onCharacteristicReadRequest: device=${device.address}, char=${characteristic.uuid}, offset=$offset")

      val internalRequestId = requestIdCounter++
      pendingRequests[internalRequestId] = PendingRequest(device, requestId, characteristic, false)

      val params: WritableMap = Arguments.createMap()
      params.putInt("requestId", internalRequestId)
      params.putString("centralUUID", device.address)
      params.putString("characteristicUUID", characteristic.uuid.toString())
      params.putString("serviceUUID", characteristic.service?.uuid?.toString() ?: "")
      params.putInt("offset", offset)
      emitOnDidReceiveReadRequest(params)
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray
    ) {
      super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)
      Log.d(TAG, "onCharacteristicWriteRequest: device=${device.address}, char=${characteristic.uuid}, offset=$offset")

      val internalRequestId = requestIdCounter++
      if (responseNeeded) {
        pendingRequests[internalRequestId] = PendingRequest(device, requestId, characteristic, true)
      }

      val requestArray = Arguments.createArray()
      val requestMap = Arguments.createMap()
      requestMap.putString("centralUUID", device.address)
      requestMap.putString("characteristicUUID", characteristic.uuid.toString())
      requestMap.putString("serviceUUID", characteristic.service?.uuid?.toString() ?: "")
      requestMap.putInt("offset", offset)
      requestMap.putString("value", Base64.encodeToString(value, Base64.NO_WRAP))
      requestArray.pushMap(requestMap)

      val params: WritableMap = Arguments.createMap()
      params.putInt("requestId", internalRequestId)
      params.putArray("requests", requestArray)
      emitOnDidReceiveWriteRequests(params)

      if (!responseNeeded) {
        bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
      }
    }

    override fun onDescriptorReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      descriptor: BluetoothGattDescriptor
    ) {
      super.onDescriptorReadRequest(device, requestId, offset, descriptor)
      Log.d(TAG, "onDescriptorReadRequest: device=${device.address}, descriptor=${descriptor.uuid}, offset=$offset")

      if (CLIENT_CONFIG == descriptor.uuid) {
        // Return stored CCCD value if present; otherwise default disabled
        val stored = descriptor.value ?: BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
        val resp = if (offset <= stored.size) stored.copyOfRange(offset, stored.size) else byteArrayOf()
        bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, resp)
      } else {
        bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
      }
    }

    override fun onDescriptorWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      descriptor: BluetoothGattDescriptor,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray
    ) {
      super.onDescriptorWriteRequest(device, requestId, descriptor, preparedWrite, responseNeeded, offset, value)
      Log.d(TAG, "onDescriptorWriteRequest: device=${device.address}, descriptor=${descriptor.uuid}, offset=$offset")

      if (CLIENT_CONFIG == descriptor.uuid) {
        // Persist the CCCD value for correct reads later
        descriptor.value = value

        val characteristic = descriptor.characteristic
        val serviceUUID = characteristic?.service?.uuid?.toString() ?: ""
        val charUUID = characteristic?.uuid?.toString() ?: ""

        if (Arrays.equals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE, value) ||
          Arrays.equals(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE, value)
        ) {
          registeredDevices.add(device)
          Log.i(TAG, "Device subscribed: ${device.address}")

          val params: WritableMap = Arguments.createMap()
          params.putString("centralUUID", device.address)
          params.putString("characteristicUUID", charUUID)
          params.putString("serviceUUID", serviceUUID)
          emitOnDidSubscribeToCharacteristic(params)
        } else if (Arrays.equals(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE, value)) {
          registeredDevices.remove(device)
          Log.i(TAG, "Device unsubscribed: ${device.address}")

          val params: WritableMap = Arguments.createMap()
          params.putString("centralUUID", device.address)
          params.putString("characteristicUUID", charUUID)
          params.putString("serviceUUID", serviceUUID)
          emitOnDidUnsubscribeFromCharacteristic(params)
        }

        if (responseNeeded) {
          bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
        }
      } else {
        if (responseNeeded) {
          bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
        }
      }
    }

    override fun onNotificationSent(device: BluetoothDevice, status: Int) {
      super.onNotificationSent(device, status)
      Log.d(TAG, "onNotificationSent: device=${device.address}, status=$status")

      val params: WritableMap = Arguments.createMap()
      params.putBoolean("ready", true)
      emitOnReadyToUpdateSubscribers(params)
    }

    override fun onServiceAdded(status: Int, service: BluetoothGattService) {
      super.onServiceAdded(status, service)
      Log.d(TAG, "onServiceAdded: service=${service.uuid}, status=$status")

      val params: WritableMap = Arguments.createMap()
      params.putString("serviceUUID", service.uuid.toString())
      params.putBoolean("success", status == BluetoothGatt.GATT_SUCCESS)
      if (status != BluetoothGatt.GATT_SUCCESS) {
        params.putString("error", "Failed to add service, status: $status")
      }
      emitOnDidAddService(params)

      // ✅ NEW: continue sequential service registration, then advertise
      if (isRegisteringServicesForAdvertising) {
        if (status == BluetoothGatt.GATT_SUCCESS) {
          addNextServiceFromQueue()
        } else {
          val error = "Failed to add service ${service.uuid}, status=$status"
          Log.e(TAG, error)
          pendingAdvertisePromise?.reject("BLE_ERROR", error)
          emitAdvertisingError(error)
          clearPendingAdvertisingPipeline()
        }
      }
    }
  }

  // ============================================================================
  // State & Info Methods
  // ============================================================================

  override fun getState(promise: Promise?) {
    emitDebugEvent("getState")
    val state = getCurrentState()
    Log.d(TAG, "getState: $state")
    promise?.resolve(state)
  }

  override fun getAuthorization(promise: Promise?) {
    emitDebugEvent("getAuthorization")
    val auth = if (bluetoothAdapter != null) AUTH_ALLOWED_ALWAYS else AUTH_DENIED
    Log.d(TAG, "getAuthorization: $auth")
    promise?.resolve(auth)
  }

  override fun isAdvertising(promise: Promise?) {
    emitDebugEvent("isAdvertising")
    Log.d(TAG, "isAdvertising: $isCurrentlyAdvertising")
    promise?.resolve(isCurrentlyAdvertising)
  }

  // ============================================================================
  // Advertising Methods
  // ============================================================================

  override fun setName(name: String?) {
    emitDebugEvent("setName(name=$name)")
    Log.d(TAG, "setName: $name")
    deviceName = name
    try {
      bluetoothAdapter?.name = name
    } catch (e: SecurityException) {
      Log.e(TAG, "setName: SecurityException - ${e.message}")
    }
  }

  override fun startAdvertising(options: String?, promise: Promise?) {
    emitDebugEvent("startAdvertising(options=$options)")
    Log.d(TAG, "startAdvertising: options=$options")

    val adapter = bluetoothAdapter
    if (adapter == null) {
      val error = "Bluetooth not supported"
      Log.e(TAG, "startAdvertising: $error")
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      return
    }

    if (!adapter.isEnabled) {
      val error = "Bluetooth is not enabled"
      Log.e(TAG, "startAdvertising: $error")
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      return
    }

    val advertiser = adapter.bluetoothLeAdvertiser
    if (advertiser == null) {
      val error = "BLE advertising not supported"
      Log.e(TAG, "startAdvertising: $error")
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      return
    }
    bluetoothLeAdvertiser = advertiser

    if (isCurrentlyAdvertising) {
      val error = "Already advertising"
      Log.e(TAG, "startAdvertising: $error")
      promise?.reject("BLE_ERROR", error)
      emitAdvertisingError(error)
      return
    }

    // Parse options
    var serviceUUIDs: List<String> = emptyList()
    var localName: String? = null

    if (!options.isNullOrEmpty()) {
      try {
        val json = JSONObject(options)
        localName = json.optString("localName", null)
        val uuidsArray = json.optJSONArray("serviceUUIDs")
        if (uuidsArray != null) {
          serviceUUIDs = (0 until uuidsArray.length()).map { uuidsArray.getString(it) }
        }
      } catch (e: Exception) {
        Log.e(TAG, "startAdvertising: Failed to parse options - ${e.message}")
      }
    }

    if (!localName.isNullOrEmpty()) {
      try {
        adapter.name = localName
      } catch (e: SecurityException) {
        Log.w(TAG, "startAdvertising: Could not set device name - ${e.message}")
      }
    }

    val advertiseSettings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .setConnectable(true)
      .setTimeout(0)
      .build()

    val advertiseDataBuilder = AdvertiseData.Builder()
      .setIncludeDeviceName(true)
      .setIncludeTxPowerLevel(false)

    for (uuid in serviceUUIDs) {
      try {
        advertiseDataBuilder.addServiceUuid(ParcelUuid(UUID.fromString(uuid)))
      } catch (e: Exception) {
        Log.e(TAG, "startAdvertising: Invalid service UUID: $uuid")
      }
    }

    val advertiseData = advertiseDataBuilder.build()

    // ✅ CRITICAL CHANGE:
    // Register services sequentially (wait for onServiceAdded), then startAdvertising.
    beginRegisterServicesThenAdvertise(advertiser, advertiseSettings, advertiseData, promise)
  }

  override fun stopAdvertising() {
    emitDebugEvent("stopAdvertising")
    Log.d(TAG, "stopAdvertising")

    try {
      advertiseCallback?.let { callback ->
        bluetoothLeAdvertiser?.stopAdvertising(callback)
      }
    } catch (e: SecurityException) {
      Log.e(TAG, "stopAdvertising: SecurityException - ${e.message}")
    }

    isCurrentlyAdvertising = false
    clearPendingAdvertisingPipeline(keepCallback = true)
  }

  // ============================================================================
  // Service Management
  // ============================================================================

  override fun addService(uuid: String?, primary: Boolean) {
    emitDebugEvent("addService(uuid=$uuid, primary=$primary)")
    Log.d(TAG, "addService: uuid=$uuid, primary=$primary")

    if (uuid == null) {
      Log.e(TAG, "addService: UUID is null")
      return
    }

    try {
      val serviceUUID = UUID.fromString(uuid)
      val serviceType = if (primary) {
        BluetoothGattService.SERVICE_TYPE_PRIMARY
      } else {
        BluetoothGattService.SERVICE_TYPE_SECONDARY
      }
      val service = BluetoothGattService(serviceUUID, serviceType)
      pendingServices[uuid] = service

      // IMPORTANT: do NOT add service to bluetoothGattServer here.
      // We will add all services sequentially inside startAdvertising(),
      // after characteristics/descriptors have been added.
    } catch (e: Exception) {
      Log.e(TAG, "addService: Failed - ${e.message}")
      val params: WritableMap = Arguments.createMap()
      params.putString("serviceUUID", uuid)
      params.putBoolean("success", false)
      params.putString("error", e.message ?: "Unknown error")
      emitOnDidAddService(params)
    }
  }

  override fun removeService(uuid: String?) {
    emitDebugEvent("removeService(uuid=$uuid)")
    Log.d(TAG, "removeService: uuid=$uuid")

    if (uuid == null) {
      Log.e(TAG, "removeService: UUID is null")
      return
    }

    pendingServices.remove(uuid)

    try {
      val serviceUUID = UUID.fromString(uuid)
      val service = bluetoothGattServer?.getService(serviceUUID)
      if (service != null) {
        bluetoothGattServer?.removeService(service)
      }
    } catch (e: Exception) {
      Log.e(TAG, "removeService: Failed - ${e.message}")
    }
  }

  override fun removeAllServices() {
    emitDebugEvent("removeAllServices")
    Log.d(TAG, "removeAllServices")

    pendingServices.clear()
    bluetoothGattServer?.clearServices()
  }

  // ============================================================================
  // Characteristic Management
  // ============================================================================

  override fun addCharacteristicToService(
    serviceUUID: String?,
    uuid: String?,
    properties: Double,
    permissions: Double,
    value: String?
  ) {
    emitDebugEvent("addCharacteristicToService(serviceUUID=$serviceUUID, uuid=$uuid, properties=$properties, permissions=$permissions)")
    Log.d(TAG, "addCharacteristicToService: serviceUUID=$serviceUUID, uuid=$uuid, properties=$properties, permissions=$permissions")

    if (serviceUUID == null || uuid == null) {
      Log.e(TAG, "addCharacteristicToService: serviceUUID or uuid is null")
      return
    }

    val service = pendingServices[serviceUUID]
    if (service == null) {
      Log.e(TAG, "addCharacteristicToService: Service not found: $serviceUUID")
      return
    }

    try {
      val charUUID = UUID.fromString(uuid)
      val propsInt = properties.toInt()
      val permsInt = permissions.toInt()

      // Ensure permissions match properties
      // If PROPERTY_WRITE is set, ensure PERMISSION_WRITE is set
      var finalPermissions = permsInt
      if ((propsInt and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
          (propsInt and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
        // Ensure write permission is set (Android constant is 0x02)
        if ((finalPermissions and BluetoothGattCharacteristic.PERMISSION_WRITE) == 0) {
          finalPermissions = finalPermissions or BluetoothGattCharacteristic.PERMISSION_WRITE
          Log.d(TAG, "  Added PERMISSION_WRITE to match PROPERTY_WRITE")
        }
      }

      val characteristic = BluetoothGattCharacteristic(
        charUUID,
        propsInt,
        finalPermissions
      )

      if (!value.isNullOrEmpty()) {
        try {
          // Try to decode as base64 first (for binary data like Battery Level)
          characteristic.value = Base64.decode(value, Base64.DEFAULT)
        } catch (e: Exception) {
          // If base64 decode fails, treat as raw UTF-8 string (for Device Info strings)
          characteristic.value = value.toByteArray(Charsets.UTF_8)
        }
      }

      if ((propsInt and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0 ||
        (propsInt and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
      ) {
        val descriptor = BluetoothGattDescriptor(
          CLIENT_CONFIG,
          BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
        // Optional: set default CCCD value to disabled
        descriptor.value = BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
        characteristic.addDescriptor(descriptor)
      }

      service.addCharacteristic(characteristic)
      Log.d(TAG, "addCharacteristicToService: Added characteristic $uuid to service $serviceUUID")
      Log.d(TAG, "  Properties: $propsInt (0x${Integer.toHexString(propsInt)})")
      Log.d(TAG, "  Permissions: $finalPermissions (0x${Integer.toHexString(finalPermissions)})")
      Log.d(TAG, "  Has PROPERTY_WRITE: ${(propsInt and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0}")
      Log.d(TAG, "  Has PROPERTY_WRITE_NO_RESPONSE: ${(propsInt and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0}")
      Log.d(TAG, "  Has PERMISSION_WRITE: ${(finalPermissions and BluetoothGattCharacteristic.PERMISSION_WRITE) != 0}")
    } catch (e: Exception) {
      Log.e(TAG, "addCharacteristicToService: Failed - ${e.message}")
    }
  }

  // ============================================================================
  // Data Operations
  // ============================================================================

  override fun updateValue(
    serviceUUID: String?,
    characteristicUUID: String?,
    value: String?,
    centralUUIDs: String?,
    promise: Promise?
  ) {
    emitDebugEvent("updateValue(serviceUUID=$serviceUUID, characteristicUUID=$characteristicUUID)")
    Log.d(TAG, "updateValue: serviceUUID=$serviceUUID, characteristicUUID=$characteristicUUID")

    if (serviceUUID == null || characteristicUUID == null || value == null) {
      promise?.resolve(false)
      return
    }

    val gattServer = bluetoothGattServer
    if (gattServer == null) {
      Log.e(TAG, "updateValue: GATT server not initialized")
      promise?.resolve(false)
      return
    }

    try {
      val service = gattServer.getService(UUID.fromString(serviceUUID))
      if (service == null) {
        Log.e(TAG, "updateValue: Service not found: $serviceUUID")
        promise?.resolve(false)
        return
      }

      val characteristic = service.getCharacteristic(UUID.fromString(characteristicUUID))
      if (characteristic == null) {
        Log.e(TAG, "updateValue: Characteristic not found: $characteristicUUID")
        promise?.resolve(false)
        return
      }

      val data = Base64.decode(value, Base64.DEFAULT)
      Log.d(TAG, "updateValue: Decoded base64 '$value' to bytes: [${data.joinToString(", ")}]")
      characteristic.value = data

      val devicesToNotify = if (!centralUUIDs.isNullOrEmpty() && centralUUIDs != "[]") {
        try {
          val uuidsArray = JSONArray(centralUUIDs)
          (0 until uuidsArray.length())
            .map { uuidsArray.getString(it) }
            .mapNotNull { connectedDevices[it] }
        } catch (e: Exception) {
          registeredDevices.toList()
        }
      } else {
        registeredDevices.toList()
      }

      var allSucceeded = true
      for (device in devicesToNotify) {
        try {
          val confirm = (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
          val success = gattServer.notifyCharacteristicChanged(device, characteristic, confirm)
          if (!success) allSucceeded = false
        } catch (e: SecurityException) {
          Log.e(TAG, "updateValue: SecurityException for device ${device.address}")
          allSucceeded = false
        }
      }

      promise?.resolve(allSucceeded)
    } catch (e: Exception) {
      Log.e(TAG, "updateValue: Failed - ${e.message}")
      promise?.resolve(false)
    }
  }

  override fun respondToRequest(requestId: Double, result: Double, value: String?) {
    emitDebugEvent("respondToRequest(requestId=$requestId, result=$result)")
    Log.d(TAG, "respondToRequest: requestId=$requestId, result=$result")

    val pendingRequest = pendingRequests.remove(requestId.toInt())
    if (pendingRequest == null) {
      Log.e(TAG, "respondToRequest: Request not found: $requestId")
      return
    }

    val gattServer = bluetoothGattServer
    if (gattServer == null) {
      Log.e(TAG, "respondToRequest: GATT server not initialized")
      return
    }

    try {
      val responseValue = if (!value.isNullOrEmpty()) {
        try {
          // Try to decode as base64 first (for binary data)
          Base64.decode(value, Base64.DEFAULT)
        } catch (e: Exception) {
          // If base64 decode fails, treat as raw UTF-8 string (for Device Info strings)
          value.toByteArray(Charsets.UTF_8)
        }
      } else {
        pendingRequest.characteristic?.value
      }

      gattServer.sendResponse(
        pendingRequest.device,
        pendingRequest.requestId,
        result.toInt(),
        0,
        responseValue
      )
    } catch (e: Exception) {
      Log.e(TAG, "respondToRequest: Failed - ${e.message}")
    }
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  override fun setDesiredConnectionLatency(latency: Double, centralUUID: String?) {
    emitDebugEvent("setDesiredConnectionLatency(latency=$latency, centralUUID=$centralUUID)")
    Log.d(TAG, "setDesiredConnectionLatency: latency=$latency, centralUUID=$centralUUID")
  }

  // ============================================================================
  // L2CAP Channel (Not fully supported on Android)
  // ============================================================================

  override fun publishL2CAPChannel(withEncryption: Boolean) {
    emitDebugEvent("publishL2CAPChannel(withEncryption=$withEncryption)")
    Log.d(TAG, "publishL2CAPChannel: Not supported on Android")

    val params: WritableMap = Arguments.createMap()
    params.putInt("psm", 0)
    params.putBoolean("success", false)
    params.putString("error", "L2CAP channels not supported on Android peripheral mode")
    emitOnDidPublishL2CAPChannel(params)
  }

  override fun unpublishL2CAPChannel(psm: Double) {
    emitDebugEvent("unpublishL2CAPChannel(psm=$psm)")
    Log.d(TAG, "unpublishL2CAPChannel: Not supported on Android")

    val params: WritableMap = Arguments.createMap()
    params.putInt("psm", psm.toInt())
    params.putBoolean("success", false)
    params.putString("error", "L2CAP channels not supported on Android peripheral mode")
    emitOnDidUnpublishL2CAPChannel(params)
  }

  // ============================================================================
  // Android Broadcast Intent Listener
  // ============================================================================

  override fun registerBroadcastReceiver(actions: ReadableArray) {
    emitDebugEvent("registerBroadcastReceiver")
    Log.d(TAG, "registerBroadcastReceiver: actions=${actions.size()}")

    // Unregister existing receiver if any
    unregisterBroadcastReceiver()

    // Convert ReadableArray to Set of actions
    registeredActions.clear()
    for (i in 0 until actions.size()) {
      val action = actions.getString(i)
      if (action != null) {
        registeredActions.add(action)
      }
    }

    if (registeredActions.isEmpty()) {
      Log.w(TAG, "registerBroadcastReceiver: No actions provided")
      return
    }

    // Create BroadcastReceiver
    broadcastReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent == null) return

        val action = intent.action ?: return
        Log.d(TAG, "BroadcastReceiver: Received intent action=$action")

        // Forward only if this action was registered (matches IntentFilter)
        if (!registeredActions.contains(action)) {
          Log.d(TAG, "BroadcastReceiver: Filtered out action=$action (not in registered actions)")
          return
        }

        Log.d(TAG, "BroadcastReceiver: Forwarding $action to TypeScript")

        // Build event params
        val params: WritableMap = Arguments.createMap()
        params.putString("action", action)

        // Extract data URI if present
        val data = intent.data
        if (data != null) {
          params.putString("data", data.toString())
        }

        // Extract type if present
        val type = intent.type
        if (type != null) {
          params.putString("type", type)
        }

        // Extract extras
        val extras = intent.extras
        if (extras != null && !extras.isEmpty) {
          val extrasMap: WritableMap = Arguments.createMap()
          extractExtrasToMap(extras, extrasMap)
          params.putMap("extras", extrasMap)
        }

        // Emit event to TypeScript
        emitOnDidReceiveBroadcastIntent(params)
      }
    }

    // Create IntentFilter with all actions
    val filter = IntentFilter()
    for (action in registeredActions) {
      filter.addAction(action)
      Log.d(TAG, "registerBroadcastReceiver: Added action filter: $action")
    }

    // Register receiver using ContextCompat for Android 8.0+ compatibility
    // RECEIVER_EXPORTED allows receiving broadcasts from system and other apps
    // This is needed for system broadcasts and custom broadcasts from ADB/other apps
    try {
      ContextCompat.registerReceiver(
        reactApplicationContext,
        broadcastReceiver,
        filter,
        ContextCompat.RECEIVER_EXPORTED
      )
      Log.i(TAG, "registerBroadcastReceiver: Successfully registered for ${registeredActions.size} actions")
    } catch (e: Exception) {
      Log.e(TAG, "registerBroadcastReceiver: Failed to register - ${e.message}")
    }
  }

  override fun unregisterBroadcastReceiver() {
    emitDebugEvent("unregisterBroadcastReceiver")
    Log.d(TAG, "unregisterBroadcastReceiver")

    broadcastReceiver?.let { receiver ->
      try {
        reactApplicationContext.unregisterReceiver(receiver)
        Log.i(TAG, "unregisterBroadcastReceiver: Successfully unregistered")
      } catch (e: Exception) {
        Log.e(TAG, "unregisterBroadcastReceiver: Failed to unregister - ${e.message}")
      }
    }

    broadcastReceiver = null
    registeredActions.clear()
  }

  /**
   * Helper to extract Intent extras to WritableMap recursively
   */
  private fun extractExtrasToMap(bundle: Bundle, map: WritableMap) {
    for (key in bundle.keySet()) {
      val value = bundle.get(key)
      when (value) {
        is String -> map.putString(key, value)
        is Int -> map.putInt(key, value)
        is Long -> map.putDouble(key, value.toDouble())
        is Double -> map.putDouble(key, value)
        is Float -> map.putDouble(key, value.toDouble())
        is Boolean -> map.putBoolean(key, value)
        is Bundle -> {
          val nestedMap: WritableMap = Arguments.createMap()
          extractExtrasToMap(value, nestedMap)
          map.putMap(key, nestedMap)
        }
        is Array<*> -> {
          val array = Arguments.createArray()
          value.forEach { item ->
            when (item) {
              is String -> array.pushString(item)
              is Int -> array.pushInt(item)
              is Long -> array.pushDouble(item.toDouble())
              is Double -> array.pushDouble(item)
              is Float -> array.pushDouble(item.toDouble())
              is Boolean -> array.pushBoolean(item)
              else -> array.pushString(item?.toString() ?: "")
            }
          }
          map.putArray(key, array)
        }
        else -> {
          // For other types, convert to string
          map.putString(key, value?.toString() ?: "")
        }
      }
    }
  }

  // ============================================================================
  // Legacy Methods
  // ============================================================================

  override fun multiply(a: Double, b: Double): Double {
    emitDebugEvent("multiply(a=$a, b=$b)")
    return a * b
  }

  override fun start(promise: Promise?) {
    emitDebugEvent("start")
    Log.d(TAG, "start (legacy)")
    startAdvertising("{}", promise)
  }

  override fun stop() {
    emitDebugEvent("stop")
    Log.d(TAG, "stop (legacy)")
    stopAdvertising()

    bluetoothGattServer?.close()
    bluetoothGattServer = null
    registeredDevices.clear()
    connectedDevices.clear()
    pendingRequests.clear()
    clearPendingAdvertisingPipeline(keepCallback = true)
  }

  override fun sendNotificationToDevices(
    serviceUUID: String?,
    characteristicUUID: String?,
    data: String?
  ) {
    emitDebugEvent("sendNotificationToDevices(serviceUUID=$serviceUUID, characteristicUUID=$characteristicUUID)")
    Log.d(TAG, "sendNotificationToDevices (legacy)")

    updateValue(serviceUUID, characteristicUUID, data, null, null)
  }
}
