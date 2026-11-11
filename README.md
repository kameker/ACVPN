# ACVPN for Windows

**English** | [Русский](README.ru.md)

ACVPN is a Windows application for connecting to your own servers and subscriptions through a local proxy. ACVPN does not provide servers or subscriptions; obtain them from a provider or set up your own.

## Features

- Import individual configurations and HTTPS subscriptions; refresh subscriptions.
- Search and sort servers, save favorites, and check latency and certificates.
- Use the Windows system proxy or configure a local HTTP/SOCKS5 proxy manually.
- Route websites and applications directly, through the proxy, or block them.
- Automatically check for updates to the installed application.
- English and Russian interfaces, light and dark themes, and a system tray.

## Installation and connection

1. Download and run the installer from [GitHub Releases](https://github.com/kameker/ACVPN/releases). Windows may warn about an unknown publisher when the build is unsigned.
2. Select **Add** and paste a configuration URI or an HTTPS subscription URL.
3. Select a server and press the connection button.
4. Press the button again to disconnect. Closing the window minimizes ACVPN to the system tray; use the tray menu to quit completely.

By default, ACVPN configures the Windows system proxy. Applications that use the system settings can send traffic through it; applications that ignore those settings are not redirected automatically. Alternatively, disable system proxy mode in settings and configure an HTTP or SOCKS5 proxy at `127.0.0.1:2080` in the application you want to use.

On normal disconnect, ACVPN restores the previous proxy settings if another program has not changed them. After an unexpected termination, it attempts restoration on the next launch.

## Servers and subscriptions

The ping check measures the time to establish a direct TCP connection to each server. For servers using ordinary TLS, it also checks the certificate by connecting through the server to `www.cloudflare.com:443`; the check is visible to the VPN server and Cloudflare. Network errors and certificate errors are displayed separately; Reality, connections without TLS, and connections with certificate verification disabled have their own statuses. A verified certificate does not guarantee that a server works, and latency is not a speed measurement.

By default, servers and favorites are sorted by ping: servers with measured latency and a verified certificate come first, followed by eligible servers without an ordinary TLS certificate; the remaining servers stay visible below. Country is inferred from the server name, not its IP address. Selecting another server while connected switches the connection to that server.

The refresh button updates subscriptions. Disconnect and wait for server checks to finish before refreshing. Individual subscriptions can be managed in the subscription sorting mode.

Some providers require a device identifier. When adding a subscription, you can opt in to sending a persistent random `X-HWID`, the OS name and version, and a device name in the `OS-username` format for that subscription URL. The provider may count this as a separate device, and the displayed name depends on the provider. The identifier and permissions are stored locally in encrypted form. If a provider returns only an “App not supported” placeholder, it does not replace saved servers.

## Routing and limitations

- Supported URI types are VLESS, VMess (base64 JSON), Trojan, Shadowsocks (SIP002), and SOCKS5. Subscriptions can contain plain-text or base64 lists of URIs. Unsupported entries are skipped; an import with no supported entries is rejected.
- For applicable links, VLESS Reality and TLS, TCP, WebSocket, and gRPC are supported. Not every provider-specific option is supported. Hysteria2, Shadowsocks plugins, and direct JSON, file, and QR-code imports are not implemented.
- Website rules apply only to traffic reaching the local proxy, and domain rules include subdomains. Application rules match the full `.exe` path and take precedence over website rules. Select a running process or enter its path manually. Rule changes take effect after reconnecting.
- The system proxy does not redirect all traffic: UDP and DNS may bypass it. A kill switch, leak protection, custom DNS settings, external IP checks, and automatic recovery after network loss are not implemented.
- Existing Windows proxy exclusions and automatic proxy detection may affect routing. System proxy mode is rejected if Windows has a PAC URL configured.
- The “proxy running” status means sing-box has started and its local port responds. It does not verify authentication, remote server availability, or the absence of leaks. The local proxy has no authentication and is accessible to other processes on the computer.
- Switching servers interrupts the connection; without a kill switch, traffic may temporarily go directly. After an application crash, the system proxy may remain enabled until ACVPN is restarted; in some cases the core process may need to be terminated manually.

## Data and updates

Settings, configurations, and subscription URLs are stored in an encrypted `data.enc` file in Electron's user data directory. Encryption uses Electron `safeStorage` and Windows DPAPI. Configuration is passed to sing-box through standard input; while the app runs, data remains accessible to processes under the same account. ACVPN does not include analytics.

HTTPS subscriptions are fetched from the supplied URL without redirects, with a 2 MB response limit. The installed application checks public GitHub releases at startup and periodically while running. Updates download automatically and install once the proxy is disconnected and Windows settings have been restored. A manual check is available in settings. Installations without the updater must be updated manually once. Unsigned builds do not provide digital verification of the publisher.

## Development and building

Building requires Windows, Node.js, and npm. CI uses Node.js 24.13.1:

```powershell
npm ci
npm test
npm start
npm run dist
```

The installer is written to `dist/`; the local unpacked build can be started from `dist/win-unpacked/ACVPN.exe`. Tests cover data handling, sing-box configuration, routing, and TLS verification using local test servers. They do not include a user-provided server or subscription.

[GitHub Actions](https://github.com/kameker/ACVPN/actions/workflows/windows-build.yml) installs dependencies, runs tests, and builds the Windows installer on changes to `main`, on pull requests, and on manual dispatch. The result is stored for 14 days as the `ACVPN-Windows-unsigned` artifact. This workflow does not sign the installer or publish a release.

### Windows code signing

To require a signature during a build, run `npx electron-builder --win nsis --config.forceCodeSigning=true`; the build fails if no signing key is configured. Trusted signing requires a valid code-signing certificate with an accessible private key. If the provider permits a `.pfx` or `.p12` file, set `WIN_CSC_LINK` to its path and `WIN_CSC_KEY_PASSWORD` to its password in the local environment. For a token or cloud key, follow the provider's instructions. Never commit private keys or passwords.

After building, verify the installer and the main `ACVPN.exe` with the PowerShell command `Get-AuthenticodeSignature`; the status should be `Valid`. Signing does not guarantee that SmartScreen warnings disappear immediately. SignPath signing requires separate approval and configuration.

## Licenses and components

ACVPN source code is licensed under [GPL-3.0-or-later](LICENSE). It includes [sing-box 1.13.21](https://github.com/SagerNet/sing-box/tree/v1.13.21), distributed under GPL-3.0-or-later with an additional restriction on using its name; see [vendor/SING-BOX-LICENSE.txt](vendor/SING-BOX-LICENSE.txt). SHA-256 of the official `sing-box-1.13.21-windows-amd64.zip` archive: `a03291793d3a3c6e266447a58140657ac099ff278abf3b8ff678932356a62ced`.

The project also uses [Electron](https://github.com/electron/electron/blob/main/LICENSE) and [flag-icons](https://github.com/lipis/flag-icons), both distributed under the MIT license. See the metadata and license files of the remaining dependencies for their terms.
