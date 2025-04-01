// This is a dummy notarization script
// In a real production environment with Apple Developer credentials,
// you would implement the actual notarization process here.

// eslint-disable-next-line import/no-extraneous-dependencies
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  console.log('Notarization step - skipping actual notarization');
  console.log('Context:', context.appOutDir);
  
  // Skip notarization since we're not requiring an Apple Developer account
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization');
    return;
  }

  // Normally, you would implement actual notarization here:
  /*
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'com.promptcomposer.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
  });
  */
}; 