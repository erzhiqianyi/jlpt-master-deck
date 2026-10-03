#!/usr/bin/env ruby
# Requires the xcodeproj gem. The generated project is checked in; this is optional.
require 'xcodeproj'
require 'fileutils'
Dir.chdir(__dir__)
project = Xcodeproj::Project.new('JLPTMasterDeck.xcodeproj')
target = project.new_target(:application, 'JLPTMasterDeck', :ios, '17.0')
source_group = project.main_group.new_group('Sources', 'Sources')
Dir.glob('Sources/*.swift').sort.each { |path| target.source_build_phase.add_file_reference(source_group.new_file(File.basename(path))) }
resources_group = project.main_group.new_group('Resources', 'Resources')
target.resources_build_phase.add_file_reference(resources_group.new_file('BrandAssets.xcassets'))
config_group = project.main_group.new_group('Config', 'Config')
config = config_group.new_file('App.xcconfig')
config_group.new_file('Info.plist')
config_group.new_file('JLPTMasterDeck.entitlements')
config_group.new_file('JLPTMasterDeckMac.entitlements')
if File.exist?('Config/GoogleService-Info.plist')
  target.resources_build_phase.add_file_reference(config_group.new_file('GoogleService-Info.plist'))
end
target.build_configurations.each do |c|
  c.base_configuration_reference = config
  c.build_settings.merge!({
    'INFOPLIST_FILE' => 'Config/Info.plist', 'GENERATE_INFOPLIST_FILE' => 'NO',
    'CODE_SIGN_ENTITLEMENTS' => 'Config/JLPTMasterDeck.entitlements',
    'CODE_SIGN_ENTITLEMENTS[sdk=macosx*]' => 'Config/JLPTMasterDeckMac.entitlements',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'cc.erzhiqian.jlptmasterdeck',
    'SUPPORTED_PLATFORMS' => 'iphoneos iphonesimulator macosx',
    'SWIFT_VERSION' => '5.0', 'ENABLE_USER_SCRIPT_SANDBOXING' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks'
  })
end
[
  ['https://github.com/firebase/firebase-ios-sdk.git', '12.9.0', ['FirebaseAuth', 'FirebaseCore']],
  ['https://github.com/google/GoogleSignIn-iOS.git', '9.2.0', ['GoogleSignIn']]
].each do |url, version, products|
  package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  package.repositoryURL = url
  package.requirement = { 'kind' => 'exactVersion', 'version' => version }
  project.root_object.package_references << package
  products.each do |name|
    dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
    dependency.package = package; dependency.product_name = name
    target.package_product_dependencies << dependency
    build = project.new(Xcodeproj::Project::Object::PBXBuildFile)
    build.product_ref = dependency
    target.frameworks_build_phase.files << build
  end
end
tests = project.new_target(:unit_test_bundle, 'JLPTMasterDeckTests', :ios, '17.0')
tests.add_dependency(target)
test_group = project.main_group.new_group('Tests', 'Tests')
Dir.glob('Tests/*.swift').sort.each { |path| tests.source_build_phase.add_file_reference(test_group.new_file(File.basename(path))) }
tests.build_configurations.each do |c|
  c.build_settings.merge!({ 'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.0',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'cc.erzhiqian.jlptmasterdeck.tests', 'TARGETED_DEVICE_FAMILY' => '1,2',
    'SUPPORTS_MACCATALYST' => 'YES', 'TEST_HOST' => '$(BUILT_PRODUCTS_DIR)/JLPTMasterDeck.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/JLPTMasterDeck',
    'BUNDLE_LOADER' => '$(TEST_HOST)' })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(tests)
scheme.set_launch_target(target)
scheme.save_as(project.path, 'JLPTMasterDeck', true)
puts 'Generated JLPTMasterDeck.xcodeproj'
