//
//  RnBlePeripheralModule.h
//  rn-ble-peripheral-module
//
//  TurboModule host class is named RNBleGattHost so it does not collide with the
//  CocoaPods Swift module name RNBlePeripheralModule.
//

#import <CoreBluetooth/CoreBluetooth.h>
#import <Foundation/Foundation.h>

#ifdef RCT_NEW_ARCH_ENABLED

#import <RnBlePeripheralModuleSpec/RnBlePeripheralModuleSpec.h>
@class SwiftRnBlePeripheralModule;

@interface RNBleGattHost : NativeRnBlePeripheralModuleSpecBase <NativeRnBlePeripheralModuleSpec>

- (void)emitOnDidUpdateState:(NSDictionary *)value;
- (void)emitOnDidStartAdvertising:(NSDictionary *)value;
- (void)emitOnDidAddService:(NSDictionary *)value;
- (void)emitOnDidSubscribeToCharacteristic:(NSDictionary *)value;
- (void)emitOnDidUnsubscribeFromCharacteristic:(NSDictionary *)value;
- (void)emitOnDidReceiveReadRequest:(NSDictionary *)value;
- (void)emitOnDidReceiveWriteRequests:(NSDictionary *)value;
- (void)emitOnReadyToUpdateSubscribers:(NSDictionary *)value;
- (void)emitOnWillRestoreState:(NSDictionary *)value;
- (void)emitOnDidPublishL2CAPChannel:(NSDictionary *)value;
- (void)emitOnDidUnpublishL2CAPChannel:(NSDictionary *)value;
- (void)emitOnDidOpenL2CAPChannel:(NSDictionary *)value;

@end

#else

@interface RNBleGattHost : NSObject

- (void)emitOnDidUpdateState:(NSDictionary *)value;
- (void)emitOnDidStartAdvertising:(NSDictionary *)value;
- (void)emitOnDidAddService:(NSDictionary *)value;
- (void)emitOnDidSubscribeToCharacteristic:(NSDictionary *)value;
- (void)emitOnDidUnsubscribeFromCharacteristic:(NSDictionary *)value;
- (void)emitOnDidReceiveReadRequest:(NSDictionary *)value;
- (void)emitOnDidReceiveWriteRequests:(NSDictionary *)value;
- (void)emitOnReadyToUpdateSubscribers:(NSDictionary *)value;
- (void)emitOnWillRestoreState:(NSDictionary *)value;
- (void)emitOnDidPublishL2CAPChannel:(NSDictionary *)value;
- (void)emitOnDidUnpublishL2CAPChannel:(NSDictionary *)value;
- (void)emitOnDidOpenL2CAPChannel:(NSDictionary *)value;

@end

#endif
