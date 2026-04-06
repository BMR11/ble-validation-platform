//
//  SwiftRnBlePeripheralModule.swift
//  rn-ble-peripheral-module
//
//  Swift side of the GATT peripheral host: wraps CBPeripheralManager and forwards
//  delegate callbacks into the RN TurboModule event emitters.
//

import CoreBluetooth
import Foundation

// MARK: - Main Peripheral Manager Class

@objc public class SwiftRnBlePeripheralModule: NSObject, CBPeripheralManagerDelegate {
    
    // MARK: - Properties
    
    /// Weak reference to the Objective-C bridge for emitting events
    private weak var bridgeHost: RNBleGattHost?
    
    /// The Core Bluetooth peripheral manager instance
    private var manager: CBPeripheralManager!
    
    /// Map of service UUID to CBMutableService for quick lookup
    var servicesMap = [String: CBMutableService]()
    
    /// Map of characteristic UUID to CBMutableCharacteristic for quick lookup
    var characteristicsMap = [String: CBMutableCharacteristic]()
    
    /// Store pending read/write requests to respond to later
    /// Key is a unique request ID, value is the CBATTRequest
    private var pendingReadRequests = [Int: CBATTRequest]()
    private var pendingWriteRequests = [Int: [CBATTRequest]]()
    private var nextRequestId = 0
    
    /// Map of central identifier to CBCentral for connection latency
    private var connectedCentrals = [String: CBCentral]()
    
    /// Local name for advertising
    var name: String = "RN_BLE"
    
    /// Flag for backward compatibility with hasListeners
    var hasListeners: Bool = false
    
    // MARK: - Initialization
    
    @objc public init(rnBleGattHost: RNBleGattHost) {
        self.bridgeHost = rnBleGattHost
        super.init()
        
        // Initialize CBPeripheralManager on the main queue
        // Using main queue ensures delegate callbacks happen on main thread
        manager = CBPeripheralManager(delegate: self, queue: DispatchQueue.main)
    }
    
    // MARK: - State & Info Methods
    
    /// Get the current state of the peripheral manager
    /// Returns: CBManagerState raw value (0-5)
    @objc public func getState(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(manager.state.rawValue)
    }
    
    /// Get the authorization status for Bluetooth
    /// Returns: CBManagerAuthorization raw value
    @objc public func getAuthorization(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 13.0, *) {
            resolve(CBPeripheralManager.authorization.rawValue)
        } else {
            // Prior to iOS 13, if we got here, we're authorized
            resolve(3) // AllowedAlways
        }
    }
    
    /// Check if the peripheral is currently advertising
    @objc public func isAdvertising(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(manager.isAdvertising)
    }
    
    // MARK: - Advertising Methods
    
    /// Set the local name for advertising
    @objc public func setName(_ name: String) {
        self.name = name
        emitLog("Name set to: \(name)")
    }
    
    /// Start advertising with JSON options
    /// Options: { localName?: string, serviceUUIDs?: string[] }
    @objc public func startAdvertising(
        _ optionsJson: String,
        resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Check if Bluetooth is powered on
        guard manager.state == .poweredOn else {
            reject("NOT_POWERED_ON", "Bluetooth is not powered on. Current state: \(manager.state.description)", nil)
            return
        }
        
        var advertisementData: [String: Any] = [:]
        
        // Parse options JSON
        if let data = optionsJson.data(using: .utf8),
           let options = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            
            // Set local name if provided, otherwise use stored name
            if let localName = options["localName"] as? String {
                advertisementData[CBAdvertisementDataLocalNameKey] = localName
            } else if !name.isEmpty {
                advertisementData[CBAdvertisementDataLocalNameKey] = name
            }
            
            // Set service UUIDs if provided
            if let serviceUUIDs = options["serviceUUIDs"] as? [String] {
                let uuids = serviceUUIDs.map { CBUUID(string: $0) }
                advertisementData[CBAdvertisementDataServiceUUIDsKey] = uuids
            } else {
                // Use all registered services
                advertisementData[CBAdvertisementDataServiceUUIDsKey] = getServiceUUIDArray()
            }
        } else {
            // No options provided, use defaults
            advertisementData[CBAdvertisementDataLocalNameKey] = name
            advertisementData[CBAdvertisementDataServiceUUIDsKey] = getServiceUUIDArray()
        }

         for (uuid, service) in servicesMap {
            // Only add if not already added (check by trying to find it)
            manager.add(service)
            emitLog("Adding service \(uuid) to manager")
        }
        
        emitLog("Starting advertising with data: \(advertisementData)")
        manager.startAdvertising(advertisementData)
        resolve(nil)
    }
    
    /// Stop advertising
    @objc public func stopAdvertising() {
        manager.stopAdvertising()
        emitLog("Stopped advertising")
    }
    
    // MARK: - Service Management
    
    /// Add a service to the peripheral
    @objc(addService:primary:)
    public func addService(_ uuid: String, primary: Bool) {
        let serviceUUID = CBUUID(string: uuid)
        
        // Check if service already exists
        if servicesMap[uuid] != nil {
            emitLog("Service \(uuid) already exists")
            return
        }
        
        let service = CBMutableService(type: serviceUUID, primary: primary)
        service.characteristics = [] // Initialize empty characteristics array
        servicesMap[uuid] = service

//        manager.add(service)
        
        emitLog("Added service: \(uuid), primary: \(primary)")
    }
    
    /// Register a service with the peripheral manager (call after adding characteristics)
    @objc public func publishService(_ uuid: String) {
        guard let service = servicesMap[uuid] else {
            emitLog("Cannot publish: Service \(uuid) not found")
            return
        }
        
        manager.add(service)
        emitLog("Publishing service: \(uuid)")
    }
    
    /// Remove a specific service
    @objc public func removeService(_ uuid: String) {
        guard let service = servicesMap[uuid] else {
            emitLog("Cannot remove: Service \(uuid) not found")
            return
        }
        
        manager.remove(service)
        servicesMap.removeValue(forKey: uuid)
        
        // Also remove characteristics for this service
        if let characteristics = service.characteristics {
            for char in characteristics {
                characteristicsMap.removeValue(forKey: char.uuid.uuidString)
            }
        }
        
        emitLog("Removed service: \(uuid)")
    }
    
    /// Remove all services
    @objc public func removeAllServices() {
        manager.removeAllServices()
        servicesMap.removeAll()
        characteristicsMap.removeAll()
        emitLog("Removed all services")
    }
    
    // MARK: - Characteristic Management
    
    /// Add a characteristic to a service
    /// Properties and permissions are bitmasks matching CBCharacteristicProperties and CBAttributePermissions
    @objc(addCharacteristicToService:uuid:properties:permissions:value:)
    public func addCharacteristicToService(
        _ serviceUUID: String,
        uuid: String,
        properties: UInt,
        permissions: UInt,
        value: String
    ) {
        guard let service = servicesMap[serviceUUID] else {
            emitLog("Cannot add characteristic: Service \(serviceUUID) not found")
            return
        }
        
        let characteristicUUID = CBUUID(string: uuid)
        let characteristicProperties = CBCharacteristicProperties(rawValue: properties)
        let characteristicPermissions = CBAttributePermissions(rawValue: permissions)
        
        // Decode Base64 value if provided
        var characteristicValue: Data? = nil
        if !value.isEmpty, let decodedData = Data(base64Encoded: value) {
            characteristicValue = decodedData
        }
        
        // Note: If characteristic supports notify/indicate, value should be nil
        // and we update it dynamically
        let shouldStoreValue = !characteristicProperties.contains(.notify) &&
                              !characteristicProperties.contains(.indicate)
        
        let characteristic = CBMutableCharacteristic(
            type: characteristicUUID,
            properties: characteristicProperties,
            value: shouldStoreValue ? characteristicValue : nil,
            permissions: characteristicPermissions
        )
        
        // If value was provided for notify/indicate, store it for later
        if !shouldStoreValue && characteristicValue != nil {
            characteristic.value = characteristicValue
        }
        
        // Add to service's characteristics array
        var existingCharacteristics = service.characteristics ?? []
        existingCharacteristics.append(characteristic)
        service.characteristics = existingCharacteristics
        
        // Store in our map for quick lookup
        characteristicsMap[uuid] = characteristic
        
        emitLog("Added characteristic \(uuid) to service \(serviceUUID) - properties: \(properties), permissions: \(permissions)")
    }
    
    // MARK: - Data Operations
    
    /// Update the value of a characteristic and notify subscribed centrals
    /// Returns: true if the update was queued, false if queue is full
    @objc(updateValue:characteristicUUID:value:centralUUIDs:resolve:reject:)
    public func updateValue(
        _ serviceUUID: String,
        characteristicUUID: String,
        value: String,
        centralUUIDs: String,
        resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let characteristic = characteristicsMap[characteristicUUID] else {
            reject("CHAR_NOT_FOUND", "Characteristic \(characteristicUUID) not found", nil)
            return
        }
        
        guard let data = Data(base64Encoded: value) else {
            reject("INVALID_DATA", "Could not decode Base64 value", nil)
            return
        }
        
        emitLog("updateValue: Decoded base64 '\(value)' to bytes: [\(data.map { String($0) }.joined(separator: ", "))]")
        
        // Parse central UUIDs if provided
        var centrals: [CBCentral]? = nil
        if !centralUUIDs.isEmpty && centralUUIDs != "[]",
           let data = centralUUIDs.data(using: .utf8),
           let uuids = try? JSONSerialization.jsonObject(with: data) as? [String] {
            centrals = uuids.compactMap { connectedCentrals[$0] }
            if centrals?.isEmpty == true {
                centrals = nil
            }
        }
        
        // Update the characteristic value
        characteristic.value = data
        
        // Notify subscribed centrals
        let success = manager.updateValue(data, for: characteristic, onSubscribedCentrals: centrals)
        
        if success {
            emitLog("Updated value for characteristic \(characteristicUUID)")
        } else {
            emitLog("Queue full for characteristic \(characteristicUUID) - will receive ready callback")
        }
        
        resolve(success)
    }
    
    /// Respond to a read or write request
    @objc(respondToRequest:result:value:)
    public func respondToRequest(
        _ requestId: Int,
        result: Int,
        value: String
    ) {
        let attResult = CBATTError.Code(rawValue: result) ?? .success
        
        // Check for pending read request
        if let request = pendingReadRequests[requestId] {
            // Set value if provided (for read responses)
            if !value.isEmpty, let data = Data(base64Encoded: value) {
                request.value = data
            }
            
            manager.respond(to: request, withResult: attResult)
            pendingReadRequests.removeValue(forKey: requestId)
            emitLog("Responded to read request \(requestId) with result: \(result)")
            return
        }
        
        // Check for pending write request
        if let requests = pendingWriteRequests[requestId], let firstRequest = requests.first {
            manager.respond(to: firstRequest, withResult: attResult)
            pendingWriteRequests.removeValue(forKey: requestId)
            emitLog("Responded to write request \(requestId) with result: \(result)")
            return
        }
        
        emitLog("No pending request found for ID: \(requestId)")
    }
    
    // MARK: - Connection Management
    
    /// Set the desired connection latency for a central
    @objc(setDesiredConnectionLatency:centralUUID:)
    public func setDesiredConnectionLatency(
        _ latency: Int,
        centralUUID: String
    ) {
        guard let central = connectedCentrals[centralUUID] else {
            emitLog("Central \(centralUUID) not found for setting latency")
            return
        }
        
        let connectionLatency: CBPeripheralManagerConnectionLatency
        switch latency {
        case 0: connectionLatency = .low
        case 1: connectionLatency = .medium
        case 2: connectionLatency = .high
        default: connectionLatency = .low
        }
        
        manager.setDesiredConnectionLatency(connectionLatency, for: central)
        emitLog("Set connection latency to \(connectionLatency) for central \(centralUUID)")
    }
    
    // MARK: - L2CAP Channel (iOS 11+)
    
    /// Publish an L2CAP channel
    @objc public func publishL2CAPChannel(_ withEncryption: Bool) {
        if #available(iOS 11.0, *) {
            manager.publishL2CAPChannel(withEncryption: withEncryption)
            emitLog("Publishing L2CAP channel with encryption: \(withEncryption)")
        } else {
            emitLog("L2CAP channels require iOS 11+")
        }
    }
    
    /// Unpublish an L2CAP channel
    @objc public func unpublishL2CAPChannel(_ psm: UInt16) {
        if #available(iOS 11.0, *) {
            manager.unpublishL2CAPChannel(psm)
            emitLog("Unpublishing L2CAP channel with PSM: \(psm)")
        } else {
            emitLog("L2CAP channels require iOS 11+")
        }
    }
    
    // MARK: - Legacy Methods (Backward Compatibility)
    
    /// Simple multiply for testing module connection
    @objc public func multiply(_ a: Int, b: Int) -> NSNumber {
        return NSNumber(value: a * b)
    }
    
    /// Legacy start method - starts advertising with current name and services
    @objc public func start(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Add all registered services to the manager first
        for (uuid, service) in servicesMap {
            // Only add if not already added (check by trying to find it)
            manager.add(service)
            emitLog("Adding service \(uuid) to manager")
        }
        
        // Start advertising with current configuration
        startAdvertising("{}", resolve: resolve, rejecter: reject)
    }
    
    /// Legacy stop method
    @objc public func stop() {
        stopAdvertising()
    }
    
    /// Legacy sendNotificationToDevices
    @objc(sendNotificationToDevices:characteristicUUID:data:)
    public func sendNotificationToDevices(
        _ serviceUUID: String,
        characteristicUUID: String,
        data: String
    ) {
        // Convert string data to Base64
        let base64Data = Data(data.utf8).base64EncodedString()
        
        updateValue(
            serviceUUID,
            characteristicUUID: characteristicUUID,
            value: base64Data,
            centralUUIDs: "[]",
            resolve: { _ in },
            rejecter: { _, _, _ in }
        )
    }
    
    // MARK: - CBPeripheralManagerDelegate Methods
    
    /// Called when the peripheral manager's state changes
    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        let stateDescription: String
        if #available(iOS 10.0, *) {
            stateDescription = peripheral.state.description
        } else {
            stateDescription = "State: \(peripheral.state.rawValue)"
        }
        
        emitLog("Bluetooth state changed: \(stateDescription)")
        
        bridgeHost?.emit(onDidUpdateState: [
            "state": peripheral.state.rawValue,
            "stateDescription": stateDescription
        ])
    }
    
    /// Called when advertising starts (or fails)
    public func peripheralManagerDidStartAdvertising(
        _ peripheral: CBPeripheralManager,
        error: Error?
    ) {
        if let error = error {
            emitLog("Advertising failed: \(error.localizedDescription)")
            bridgeHost?.emit(onDidStartAdvertising: [
                "success": false,
                "error": error.localizedDescription
            ])
        } else {
            emitLog("Advertising started successfully")
            bridgeHost?.emit(onDidStartAdvertising: [
                "success": true
            ])
        }
    }
    
    /// Called when a service is added
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didAdd service: CBService,
        error: Error?
    ) {
        if let error = error {
            emitLog("Failed to add service \(service.uuid.uuidString): \(error.localizedDescription)")
            bridgeHost?.emit(onDidAddService: [
                "serviceUUID": service.uuid.uuidString,
                "success": false,
                "error": error.localizedDescription
            ])
        } else {
            emitLog("Service added: \(service.uuid.uuidString)")
            bridgeHost?.emit(onDidAddService: [
                "serviceUUID": service.uuid.uuidString,
                "success": true
            ])
        }
    }
    
    /// Called when a central subscribes to a characteristic
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        central: CBCentral,
        didSubscribeTo characteristic: CBCharacteristic
    ) {
        let centralUUID = central.identifier.uuidString
        
        // Store central for later use (e.g., connection latency)
        connectedCentrals[centralUUID] = central
        
        // Find parent service UUID
        var serviceUUID = ""
        for (uuid, service) in servicesMap {
            if service.characteristics?.contains(where: { $0.uuid == characteristic.uuid }) == true {
                serviceUUID = uuid
                break
            }
        }
        
        emitLog("Central \(centralUUID) subscribed to \(characteristic.uuid.uuidString)")
        
//        bridgeHost?.emit(onDidSubscribeToCharacteristic: [
//            "centralUUID": centralUUID,
//            "characteristicUUID": characteristic.uuid.uuidString,
//            "serviceUUID": serviceUUID
//        ])
      
      bridgeHost?.emit(onDidUpdateState: [
          "state": "onDidSubscribeToCharacteristic",
          "stateDescription": "[native🟣] onDidSubscribeToCharacteristic",
          "centralUUID": centralUUID,
          "characteristicUUID": characteristic.uuid.uuidString,
          "serviceUUID": serviceUUID
      ])
      
    }
    
    /// Called when a central unsubscribes from a characteristic
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        central: CBCentral,
        didUnsubscribeFrom characteristic: CBCharacteristic
    ) {
        let centralUUID = central.identifier.uuidString
        
        // Find parent service UUID
        var serviceUUID = ""
        for (uuid, service) in servicesMap {
            if service.characteristics?.contains(where: { $0.uuid == characteristic.uuid }) == true {
                serviceUUID = uuid
                break
            }
        }
        
        emitLog("Central \(centralUUID) unsubscribed from \(characteristic.uuid.uuidString)")
        
//        bridgeHost?.emit(onDidUnsubscribeFromCharacteristic: [
//            "centralUUID": centralUUID,
//            "characteristicUUID": characteristic.uuid.uuidString,
//            "serviceUUID": serviceUUID
//        ])
      
        bridgeHost?.emit(onDidUpdateState: [
          "state": "onDidUnsubscribeFromCharacteristic",
          "stateDescription": "[native🟣] onDidUnsubscribeFromCharacteristic",
          "centralUUID": centralUUID,
          "characteristicUUID": characteristic.uuid.uuidString,
          "serviceUUID": serviceUUID
        ])
    }
    
    /// Called when a read request is received
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didReceiveRead request: CBATTRequest
    ) {
        let requestId = nextRequestId
        nextRequestId += 1
        
        // Store request for later response
        pendingReadRequests[requestId] = request
        
        // Find parent service UUID
        var serviceUUID = ""
        for (uuid, service) in servicesMap {
            if service.characteristics?.contains(where: { $0.uuid == request.characteristic.uuid }) == true {
                serviceUUID = uuid
                break
            }
        }
        
        emitLog("Read request received for \(request.characteristic.uuid.uuidString), requestId: \(requestId)")
        
        bridgeHost?.emit(onDidReceiveReadRequest: [
            "requestId": requestId,
            "centralUUID": request.central.identifier.uuidString,
            "characteristicUUID": request.characteristic.uuid.uuidString,
            "serviceUUID": serviceUUID,
            "offset": request.offset
        ])
    }
    
    /// Called when write request(s) are received
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didReceiveWrite requests: [CBATTRequest]
    ) {
        let requestId = nextRequestId
        nextRequestId += 1
        
        // Store requests for later response
        pendingWriteRequests[requestId] = requests
        
        // Build array of request data
        var requestsArray: [[String: Any]] = []
        
        for request in requests {
            // Find parent service UUID
            var serviceUUID = ""
            for (uuid, service) in servicesMap {
                if service.characteristics?.contains(where: { $0.uuid == request.characteristic.uuid }) == true {
                    serviceUUID = uuid
                    break
                }
            }
            
            // Store central for later use
            connectedCentrals[request.central.identifier.uuidString] = request.central
            
            // Encode value as Base64
            let valueBase64 = request.value?.base64EncodedString() ?? ""
            
            requestsArray.append([
                "centralUUID": request.central.identifier.uuidString,
                "characteristicUUID": request.characteristic.uuid.uuidString,
                "serviceUUID": serviceUUID,
                "offset": request.offset,
                "value": valueBase64,
            ])
            
            // Update the characteristic value
            if let char = characteristicsMap[request.characteristic.uuid.uuidString] {
                char.value = request.value
            }
          
          emitLog("Loop Write request requestValue: \(String(describing: request.value)), valueBase64: \(valueBase64)")
            
        }
        
        emitLog("Write request(s) received, count: \(requests.count), requestId: \(requestId)")
        
        bridgeHost?.emit(onDidReceiveWriteRequests: [
            "requestId": requestId,
            "requests": requestsArray
        ])
    }
    
    /// Called when the peripheral manager is ready to update subscribers
    /// This happens after updateValue returned false due to queue being full
    public func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        emitLog("Ready to update subscribers")
        
//        bridgeHost?.emit(onReadyToUpdateSubscribers: [
//            "ready": true
//        ])
      
      bridgeHost?.emit(onDidUpdateState: [
        "state": "onReadyToUpdateSubscribers",
        "stateDescription": "[native🟣] onReadyToUpdateSubscribers",
        "ready": true,
      ])
    }
    
    /// Called for state restoration (background mode)
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        willRestoreState dict: [String: Any]
    ) {
        var servicesData: [[String: Any]] = []
        
        if let restoredServices = dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService] {
            for service in restoredServices {
                // Re-add to our map
                let uuid = service.uuid.uuidString
                servicesMap[uuid] = service
                
                var characteristicsData: [[String: Any]] = []
                for characteristic in service.characteristics ?? [] {
                    if let mutableChar = characteristic as? CBMutableCharacteristic {
                        characteristicsMap[characteristic.uuid.uuidString] = mutableChar
                    }
                    
                    characteristicsData.append([
                        "uuid": characteristic.uuid.uuidString,
                        "properties": characteristic.properties.rawValue,
                        "permissions": 0 // Not available from restored characteristic
                    ])
                }
                
                servicesData.append([
                    "uuid": uuid,
                    "isPrimary": service.isPrimary,
                    "characteristics": characteristicsData
                ])
            }
        }
        
        var advertisementDataDict: [String: Any] = [:]
        if let advertisementData = dict[CBPeripheralManagerRestoredStateAdvertisementDataKey] as? [String: Any] {
            if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
                advertisementDataDict["localName"] = localName
            }
            if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
                advertisementDataDict["serviceUUIDs"] = serviceUUIDs.map { $0.uuidString }
            }
        }
        
        emitLog("State restoration: \(servicesData.count) services")
        
        bridgeHost?.emit(onWillRestoreState: [
            "services": servicesData,
            "advertisementData": advertisementDataDict
        ])
    }
    
    /// Called when L2CAP channel is published (iOS 11+)
    @available(iOS 11.0, *)
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didPublishL2CAPChannel PSM: CBL2CAPPSM,
        error: Error?
    ) {
        if let error = error {
            emitLog("Failed to publish L2CAP channel: \(error.localizedDescription)")
            bridgeHost?.emit(onDidPublishL2CAPChannel: [
                "psm": PSM,
                "success": false,
                "error": error.localizedDescription
            ])
        } else {
            emitLog("Published L2CAP channel with PSM: \(PSM)")
            bridgeHost?.emit(onDidPublishL2CAPChannel: [
                "psm": PSM,
                "success": true
            ])
        }
    }
    
    /// Called when L2CAP channel is unpublished (iOS 11+)
    @available(iOS 11.0, *)
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didUnpublishL2CAPChannel PSM: CBL2CAPPSM,
        error: Error?
    ) {
        if let error = error {
            emitLog("Failed to unpublish L2CAP channel: \(error.localizedDescription)")
            bridgeHost?.emit(onDidUnpublishL2CAPChannel: [
                "psm": PSM,
                "success": false,
                "error": error.localizedDescription
            ])
        } else {
            emitLog("Unpublished L2CAP channel with PSM: \(PSM)")
            bridgeHost?.emit(onDidUnpublishL2CAPChannel: [
                "psm": PSM,
                "success": true
            ])
        }
    }
    
    /// Called when L2CAP channel is opened (iOS 11+)
    @available(iOS 11.0, *)
    public func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didOpen channel: CBL2CAPChannel?,
        error: Error?
    ) {
        let psm = channel?.psm ?? 0
        
        if let error = error {
            emitLog("Failed to open L2CAP channel: \(error.localizedDescription)")
            bridgeHost?.emit(onDidOpenL2CAPChannel: [
                "psm": psm,
                "success": false,
                "error": error.localizedDescription
            ])
        } else {
            emitLog("Opened L2CAP channel with PSM: \(psm)")
            bridgeHost?.emit(onDidOpenL2CAPChannel: [
                "psm": psm,
                "success": true
            ])
        }
    }
    
    // MARK: - Helper Methods
    
    /// Get array of all service UUIDs
    private func getServiceUUIDArray() -> [CBUUID] {
        return servicesMap.values.map { $0.uuid }
    }
    
    /// Emit a log message to JavaScript (for debugging)
    private func emitLog(_ message: String) {
        print("[SwiftRnBlePeripheralModule] \(message)")
        
        // Also emit to JS for on-screen debugging
        bridgeHost?.emit(onDidUpdateState: [
            "state": manager.state.rawValue,
            "stateDescription": "[native🟣] \(message)"
        ])
    }
}

// MARK: - CBManagerState Extension for Description

@available(iOS 10.0, *)
extension CBManagerState: @retroactive CustomStringConvertible {
    public var description: String {
        switch self {
        case .poweredOff: return "poweredOff"
        case .poweredOn: return "poweredOn"
        case .resetting: return "resetting"
        case .unauthorized: return "unauthorized"
        case .unknown: return "unknown"
        case .unsupported: return "unsupported"
        @unknown default: return "unknown"
        }
    }
}

// MARK: - Standard BLE UUIDs (Convenience)

public enum StandardBLEService {
    public static let heartRate = CBUUID(string: "180D")
    public static let battery = CBUUID(string: "180F")
    public static let deviceInformation = CBUUID(string: "180A")
    public static let genericAccess = CBUUID(string: "1800")
    public static let genericAttribute = CBUUID(string: "1801")
}

public enum StandardBLECharacteristic {
    public static let heartRateMeasurement = CBUUID(string: "2A37")
    public static let batteryLevel = CBUUID(string: "2A19")
    public static let manufacturerName = CBUUID(string: "2A29")
    public static let modelNumber = CBUUID(string: "2A24")
    public static let serialNumber = CBUUID(string: "2A25")
    public static let firmwareRevision = CBUUID(string: "2A26")
    public static let deviceName = CBUUID(string: "2A00")
}
