=== Swift Currency - Multi-Currency Switcher for WooCommerce ===
Contributors: codeies
Tags: woocommerce, currency, switcher, multi-currency, money
Requires at least: 6.2
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A professional and customizable currency switcher for WooCommerce. Allow customers to switch between currencies with premium design styles.

== Description ==

Swift Currency is a modern, lightweight, and professional multi-currency switcher for WooCommerce. It allows you to display currencies in a beautiful way, supporting multiple display styles including a fancy dropdown, a clean list, and modern buttons.

The plugin is designed to be highly customizable, letting you control exactly how your switcher looks and behaves. With built-in SVG flag support and real-time exchange rate updates, it provides a premium experience for your international customers.

= Free Features =
* **Unlimited Currencies** - Enable as many currencies as your store needs, including your base currency.
* **Multiple Switcher Styles** - Choose between a professional Fancy Dropdown, a clean List, or modern Pill Buttons.
* **Automatic Exchange Rates** - Daily updates from the European Central Bank (ECB) for accurate fiat conversions.
* **Cryptocurrency Support** - Enable Bitcoin, Ethereum, and other popular cryptocurrencies with live rates from CoinGecko or Binance.
* **WooCommerce Integration** - Seamlessly convert product prices, cart totals, and checkout amounts.
* **Payment Gateway Mapping** - Map enabled currencies to payment gateways and optionally fall back to the base currency when a gateway does not support the selected currency.
* **Customizable Display** - Control symbol position, decimal places, thousand separators, and more.
* **Multiple Placements** - Add the switcher to your header, footer, sidebar, or anywhere using shortcodes and widgets.
* **Geolocation Ready** - Detect visitor location (requires Pro for auto-switching).
* **Developer Friendly** - Extensive hooks, filters, and a clean REST API for custom integrations.
* **Optimized for Speed** - Lightweight and performance-focused with advanced caching.

= Pro Features =
* **Premium Exchange Providers** - Support for Fixer.io, OpenExchangeRates, and ExchangeRate-API.
* **Auto-Geolocation** - Automatically switch currency based on the visitor's country.
* **Multi-Currency Checkout** - Let customers pay in their preferred currency during checkout.
* **Charm Pricing & Rounding** - Professional rounding rules (e.g., .99) for all converted prices.
* **Elementor Integration** - Dedicated widgets for easy drag-and-drop customization.


== External Services ==

This plugin fetches exchange rates from external services. Below is a complete disclosure of all external HTTP requests made by this plugin.

= European Central Bank (ECB) Exchange Rate Feed =
This plugin fetches daily foreign exchange reference rates from the European Central Bank to convert prices between currencies.

* **What is sent:** A plain HTTP GET request with no user data.
* **When:** Only when the exchange-rate cache is empty or expired (default: once per day via WP-Cron).
* **Endpoint:** https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
* **Terms of use:** https://www.ecb.europa.eu/home/disclaimer/html/index.en.html
* **Privacy policy:** https://data.ecb.europa.eu/privacy-statement-ecb-data-portal

= CoinGecko Cryptocurrency Rates =
This plugin fetches real-time cryptocurrency exchange rates from CoinGecko when crypto currencies are enabled.

* **What is sent:** A plain HTTP GET request with no user data.
* **When:** Only when crypto exchange rates are requested and the cache is expired (configurable interval, default: hourly).
* **Endpoint:** https://api.coingecko.com/api/v3/simple/price
* **Terms of use:** https://www.coingecko.com/en/terms
* **Privacy policy:** https://www.coingecko.com/en/privacy

= Binance Cryptocurrency Rates =
This plugin can optionally fetch cryptocurrency exchange rates from Binance as an alternative crypto rate provider.

* **What is sent:** A plain HTTP GET request with no user data.
* **When:** Only when Binance is selected as the crypto provider and the cache is expired.
* **Endpoint:** https://api.binance.com/api/v3/ticker/price
* **Terms of use:** https://www.binance.com/en/terms
* **Privacy policy:** https://www.binance.com/en/privacy

== Privacy ==

We are committed to transparency about the data Swift Currency collects and how it is handled.

= What Data Is Collected? =

1. **Logging Data** (Optional, disabled by default)
   * Exchange-rate update attempts and results
   * API call errors and responses
   * System events and warnings
   * User ID (if applicable)
   * IP address (anonymized via `wp_privacy_anonymize_ip()`)
   * Timestamp

2. **Exchange Rate Data** (Always collected)
   * Current exchange rates from the configured providers
   * Historical rate data for reporting
   * Rate update timestamps

All information is stored locally inside your WordPress database. The only outbound requests are the external rate lookups listed above, which contain **no user data**. The front end sets a `swiftcurrency_selected` cookie solely to remember the visitor's last chosen currency; no other tracking cookies are written.

= How Is Data Used? =

Logging data is used exclusively to troubleshoot issues, monitor plugin health, and debug provider/API integrations.

= Data Retention =

* **Logging Data:** Stored for 30 days by default (configurable under **Swift Currency → Settings → Advanced → Logging**).
* **Rate History:** Stored for 1 year (not user configurable).

Old data is automatically pruned using the plugin's WP-Cron cleanup tasks.

= How to Disable or Delete Data =

* **Disable Logging:** Go to **Swift Currency → Settings → Advanced** and toggle off "Enable Logging".
* **Delete All Data on Uninstall:** In the same screen, enable "Delete Data on Uninstall" before deactivating and deleting the plugin to remove all plugin data/tables.

= User Rights =

Users can:

* Access logging data stored in their database
* Delete cached/logged data via the "Clear Cache" tools or by uninstalling with the delete option enabled
* Disable logging so no diagnostic data is stored
* Export data via standard WordPress privacy tools if integrated

= GDPR Compliance =

Swift Currency is designed to meet GDPR expectations:


* ✅ No user information is sent to external services
* ✅ Only a functional `swiftcurrency_selected` cookie is stored to remember the chosen currency
* ✅ IP addresses inside logs are anonymized
* ✅ Data retention windows are configurable
* ✅ Users can delete their data at any time
* ✅ Logging can be fully disabled

== Installation ==

1. Upload the `swift-currency` folder to the `/wp-content/plugins/` directory.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Navigate to **Swift Currency -> Settings** in your WordPress admin to configure your currencies.
4. Use the shortcode `[swiftcurrency_switcher]` or the "Swift Currency Switcher" widget to display it on your site.

== Frequently Asked Questions ==

= How do I add the switcher to my site? =
You can use the shortcode `[swiftcurrency_switcher]` in any page or post. Alternatively, you can add the "Swift Currency Switcher" widget to your sidebar or footer via Appearance > Widgets.

= Does it support automatic rate updates? =
Yes, the free version includes automatic exchange rate updates via the European Central Bank (ECB).

= Can I customize the colors? =
Absolutely. You can change the "Accent Color" in the Display settings to match your brand. You can also add custom CSS for advanced styling.

= How many currencies can I enable? =
You can enable 3 currencies in the free version, including your store's base currency.

== Screenshots ==

1. **Professional Admin Settings** - Elegant interface to manage your currencies and display options.
2. **Fancy Dropdown Switcher** - A premium dropdown with flags and smooth animations.
3. **List & Button Styles** - Alternative modern layouts for your currency switcher.

== Changelog ==

= 1.0.4 =
* Compatibility: Declared compatibility with WordPress 6.7 and WooCommerce 7.0+ (up to 9.0).
* Coding Standards: Fixed brace placement throughout — all classes now use WordPress K&R style (opening `{` on the same line as the declaration).
* Coding Standards: Added required spaces inside parentheses for all control structures (`if`, `foreach`, `switch`) and function calls to comply with WPCS.
* Coding Standards: Added complete docblocks (`@since`, `@param`, `@return`) to all previously undocumented private helper methods: `sanitize_currency_code_array()`, `sanitize_rate_map()`, and `sanitize_interval_setting()`.
* Coding Standards: Bumped `@since 1.0.4` tag on the `swiftcurrency_current_currency` filter docblock to match the version it was refined.
* Pro Add-on: Upgraded dependency notice from deprecated `class="error"` to the correct WordPress `class="notice notice-error"` markup.
* Pro Add-on: Bumped version to 1.0.1; declared `WC requires at least: 7.0` and `WC tested up to: 9.0` in plugin header.
* Pro Add-on: Added `@since 1.0.0` docblock tags to all Pro class methods.
* Pro Add-on: Refactored anonymous filter closures in `init_components()` to the multi-line WPCS-preferred style.

= 1.0.3 =
* Fix: Cron auto-updates no longer silently skip when a Pro-tier rate provider (fixer, currencylayer, openexchangerates, exchangerate-api) is configured but the Pro add-on is not active. The scheduler now falls back to ECB automatically and logs a warning, so exchange rates are never left stale.
* Security: Improved output escaping across admin and frontend templates — CSS class ternaries, aria attributes, number_format(), human_time_diff(), and translated strings now consistently use esc_attr()/esc_html().
* Security: register_setting() now includes description and show_in_rest=false parameters.

= 1.0.2 =
* Security: Added proper uninstall.php handler for WordPress.org compliance.
* Security: Fixed database query escaping in installer for enhanced security.
* Security: Added HTML escaping in admin JavaScript to prevent XSS vulnerabilities.
* Enhancement: Improved translation compatibility with WordPress.org plugin repository expectations.
* Compatibility: Ensured full WordPress.org Plugin Repository compliance.

= 1.0.1 =
* Bug fixes and performance improvements.

= 1.0.0 =
* Initial stable release.
* Introduced three professional switcher styles: Fancy Dropdown, List, and Buttons.
* Added support for local SVG flags.
* Integrated real-time exchange rates via European Central Bank (ECB).
* Added comprehensive display customization (Accent colors, symbols, labels).
* Full compatibility with WooCommerce and performance caching.
* Clean and sanitized codebase following WordPress.org best practices.

== Upgrade Notice ==

= 1.0.4 =
Compatibility release for WordPress 6.7 and WooCommerce 7.0+. Includes WordPress coding-standards fixes across the codebase. No database changes — safe to update.

= 1.0.0 =
Initial release of Swift Currency. Start selling globally with a professional currency switcher!
