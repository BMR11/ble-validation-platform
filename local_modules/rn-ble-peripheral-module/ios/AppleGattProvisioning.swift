//
//  AppleGattProvisioning.swift
//  rn-ble-peripheral-module
//
//  iOS and macOS publish Battery (180F) and Device Information (180A) for the
//  host. Adding those SIG UUIDs to CBPeripheralManager makes centrals read the
//  Mac or iPhone (manufacturer "Apple Inc.", the host battery level) instead
//  of the profile. Apple does not provide an API to override that.
//
//  Publish the service on a vendor UUID that is not the Bluetooth base UUID.
//  Characteristic UUIDs stay on the SIG base (2A19, 2A29, …).
//
//  Keep the UUID strings in sync with shared/appleGattProvisioning.ts.
//

import CoreBluetooth
import Foundation

enum AppleGattProvisioning {
    static let vendorNode = "B1E000000000"
    static let owned: Set<String> = ["180A", "180F"]

    static let catalogServiceUUID = "F1B0A001-B1E0-4000-8000-00805F9B34FB"
    static let catalogCharacteristicUUID = "F1B0A002-B1E0-4000-8000-00805F9B34FB"

    /// 16-bit assigned number for a SIG UUID, or nil for any other UUID
    /// (including this platform's aliases, whose last group is the vendor node).
    static func sigShortId(_ uuid: String) -> String? {
        let hex = uuid
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "{", with: "")
            .replacingOccurrences(of: "}", with: "")
            .uppercased()
        if hex.count == 4, isHex(hex) {
            return hex
        }
        guard hex.count == 32,
              hex.hasPrefix("0000"),
              hex.hasSuffix("00001000800000805F9B34FB"),
              isHex(hex) else {
            return nil
        }
        return String(hex.dropFirst(4).prefix(4))
    }

    static func isOwnedSigService(_ uuid: String) -> Bool {
        guard let short = sigShortId(uuid) else {
            return false
        }
        return owned.contains(short)
    }

    /// UUID passed to CoreBluetooth. System-owned services are rewritten.
    /// Already-aliased or custom UUIDs are returned unchanged.
    static func publishedUuid(for uuid: String) -> String {
        guard let short = sigShortId(uuid), owned.contains(short) else {
            return uuid
        }
        return "0000\(short)-0000-1000-8000-\(vendorNode)"
    }

    /// `{"180A":"0000180A-…","180F":"0000180F-…"}` with sorted keys.
    static func catalogJson(_ published: [String: String]) -> String {
        let parts = published.keys.sorted().map { key -> String in
            let value = published[key] ?? ""
            return "\"\(key)\":\"\(value)\""
        }
        return "{\(parts.joined(separator: ","))}"
    }

    private static func isHex(_ value: String) -> Bool {
        !value.isEmpty && value.allSatisfy { character in
            (character >= "0" && character <= "9") || (character >= "A" && character <= "F")
        }
    }
}
