require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RNBlePeripheralModule"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://local.invalid/rn-ble-peripheral-module"
  s.license      = package["license"]
  s.authors      = { "local" => "local@localhost" }

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :path => "." }

  s.source_files = "ios/**/*.{h,m,mm,cpp,swift}"
  s.static_framework = true

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_OBJC_BRIDGING_HEADER' => '$(PODS_TARGET_SRCROOT)/ios/RNBlePeripheralModule-Bridging-Header.h'
  }

  install_modules_dependencies(s)
end
