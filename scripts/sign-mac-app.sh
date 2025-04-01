#!/bin/bash
# This script manually signs the application with the required entitlements
# Must be run after building the app with npm run dist:all

# Navigate to the project root
cd "$(dirname "$0")/.."

echo "Manually signing the app with entitlements..."

# First, create the entitlements folder if it doesn't exist
mkdir -p build

# Check if entitlements file exists
if [ ! -f "build/entitlements.mac.plist" ]; then
  echo "Error: build/entitlements.mac.plist not found!"
  exit 1
fi

# Create a temporary entitlements file for child processes
cat > build/entitlements.child.plist << EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <false/>
  <key>com.apple.security.inherit</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
EOL

# Remove any extended attributes that might interfere with signing
echo "Removing extended attributes..."
xattr -cr "release/mac/Prompt Composer.app"

APP_PATH="release/mac/Prompt Composer.app"
APP_NAME="Prompt Composer"

# Remove all existing signatures first
echo "Removing existing signatures..."
find "$APP_PATH" -name "*.dylib" -exec codesign --remove-signature {} \; 2>/dev/null || true
find "$APP_PATH" -name "*.so" -exec codesign --remove-signature {} \; 2>/dev/null || true
find "$APP_PATH" -path "*/Contents/MacOS/*" -exec codesign --remove-signature {} \; 2>/dev/null || true
find "$APP_PATH" -path "*/Contents/Frameworks/*.app" -exec codesign --remove-signature {} \; 2>/dev/null || true
find "$APP_PATH" -name "*.framework" -exec codesign --remove-signature {} \; 2>/dev/null || true
codesign --remove-signature "$APP_PATH" 2>/dev/null || true

# Sign chrome_crashpad_handler first
echo "Signing crashpad handler..."
CRASHPAD_HANDLER="$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler"
if [ -f "$CRASHPAD_HANDLER" ]; then
  codesign --force --sign - --options runtime --timestamp --entitlements build/entitlements.child.plist "$CRASHPAD_HANDLER"
fi

# Sign all standalone executables in the app
echo "Signing executables..."
find "$APP_PATH" -path "*/Contents/MacOS/*" -type f | while read -r exe; do
  echo "Signing $exe"
  if [[ "$exe" == *"$APP_NAME" ]]; then
    # Main executable needs full entitlements
    codesign --force --sign - --options runtime --timestamp --entitlements build/entitlements.mac.plist "$exe"
  else
    # Helper executables need inherited entitlements
    codesign --force --sign - --options runtime --timestamp --entitlements build/entitlements.child.plist "$exe"
  fi
done

# Sign all dynamic libraries
echo "Signing dynamic libraries..."
find "$APP_PATH" -name "*.dylib" | while read -r lib; do
  echo "Signing $lib"
  codesign --force --sign - --options runtime --timestamp --entitlements build/entitlements.child.plist "$lib"
done

# Sign any .so files
echo "Signing .so files..."
find "$APP_PATH" -name "*.so" | while read -r lib; do
  echo "Signing $lib"
  codesign --force --sign - --options runtime --timestamp --entitlements build/entitlements.child.plist "$lib"
done

# Sign helpers
echo "Signing helper apps..."
find "$APP_PATH" -path "*/Contents/Frameworks/*.app" -type d | while read -r helper; do
  echo "Signing $helper"
  codesign --force --sign - --options runtime --timestamp --deep --entitlements build/entitlements.child.plist "$helper"
done

# Sign frameworks
echo "Signing frameworks..."
find "$APP_PATH" -name "*.framework" -type d | while read -r framework; do
  echo "Signing $framework"
  codesign --force --sign - --options runtime --timestamp --deep --entitlements build/entitlements.child.plist "$framework"
done

# Finally sign the main app bundle
echo "Signing main app bundle..."
codesign --force --sign - --options runtime --timestamp --deep --entitlements build/entitlements.mac.plist "$APP_PATH"

echo "Signing complete. Verifying..."
codesign -dvv "$APP_PATH"

# Create a DMG with the signed app
echo "Creating DMG with signed app..."
hdiutil create -volname "Prompt Composer" -srcfolder "$APP_PATH" -ov -format UDZO "release/Prompt Composer-signed.dmg"

echo "Done. Signed app is in $APP_PATH and DMG is in release/Prompt Composer-signed.dmg" 