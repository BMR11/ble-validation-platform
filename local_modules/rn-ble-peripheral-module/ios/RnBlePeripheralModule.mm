//
//  RnBlePeripheralModule.mm
//  rn-ble-peripheral-module
//
//  Objective-C++ TurboModule: forwards to SwiftRnBlePeripheralModule. Event emitters
//  come from the generated NativeRnBlePeripheralModuleSpec base class.
//

#import <RnBlePeripheralModule.h>
#if __has_include("RNBlePeripheralModule-Swift.h")
#import <RNBlePeripheralModule-Swift.h>
#else
#import <RNBlePeripheralModule/RNBlePeripheralModule-Swift.h>
#endif

@implementation RNBleGattHost {
    SwiftRnBlePeripheralModule * _swiftHost;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _swiftHost = [[SwiftRnBlePeripheralModule alloc] initWithRnBleGattHost:self];
    }
    return self;
}

RCT_EXPORT_MODULE(RnBlePeripheralModule)

- (void)getState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [_swiftHost getState:resolve rejecter:reject];
}

- (void)getAuthorization:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [_swiftHost getAuthorization:resolve rejecter:reject];
}

- (void)isAdvertising:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [_swiftHost isAdvertising:resolve rejecter:reject];
}

- (void)setName:(NSString *)name {
    [_swiftHost setName:name];
}

- (void)startAdvertising:(NSString *)options resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [_swiftHost startAdvertising:options resolve:resolve rejecter:reject];
}

- (void)stopAdvertising {
    [_swiftHost stopAdvertising];
}

- (void)addService:(NSString *)uuid primary:(BOOL)primary {
    [_swiftHost addService:uuid primary:primary];
}

- (void)removeService:(NSString *)uuid {
    [_swiftHost removeService:uuid];
}

- (void)removeAllServices {
    [_swiftHost removeAllServices];
}

- (void)addCharacteristicToService:(NSString *)serviceUUID
                              uuid:(NSString *)uuid
                        properties:(double)properties
                       permissions:(double)permissions
                             value:(NSString *)value {
    [_swiftHost addCharacteristicToService:serviceUUID
                                                   uuid:uuid
                                             properties:(NSUInteger)properties
                                            permissions:(NSUInteger)permissions
                                                  value:value];
}

- (void)updateValue:(NSString *)serviceUUID
 characteristicUUID:(NSString *)characteristicUUID
              value:(NSString *)value
       centralUUIDs:(NSString *)centralUUIDs
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
    [_swiftHost updateValue:serviceUUID
                      characteristicUUID:characteristicUUID
                                   value:value
                            centralUUIDs:centralUUIDs
                                 resolve:resolve
                                  reject:reject];
}

- (void)respondToRequest:(double)requestId result:(double)result value:(NSString *)value {
    [_swiftHost respondToRequest:(NSInteger)requestId
                                       result:(NSInteger)result
                                        value:value];
}

- (void)setDesiredConnectionLatency:(double)latency centralUUID:(NSString *)centralUUID {
    [_swiftHost setDesiredConnectionLatency:(NSInteger)latency
                                             centralUUID:centralUUID];
}

- (void)publishL2CAPChannel:(BOOL)withEncryption {
    [_swiftHost publishL2CAPChannel:withEncryption];
}

- (void)unpublishL2CAPChannel:(double)psm {
    [_swiftHost unpublishL2CAPChannel:(UInt16)psm];
}

- (NSNumber *)multiply:(double)a b:(double)b {
    return [_swiftHost multiply:(NSInteger)a b:(NSInteger)b];
}

- (void)start:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [_swiftHost start:resolve rejecter:reject];
}

- (void)stop {
    [_swiftHost stop];
}

- (void)sendNotificationToDevices:(NSString *)serviceUUID
               characteristicUUID:(NSString *)characteristicUUID
                             data:(NSString *)data {
    [_swiftHost sendNotificationToDevices:serviceUUID
                                    characteristicUUID:characteristicUUID
                                                  data:data];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeRnBlePeripheralModuleSpecJSI>(params);
}

@end
