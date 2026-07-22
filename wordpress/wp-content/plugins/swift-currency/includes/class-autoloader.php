<?php
/**
 * Autoloader Class
 *
 * PSR-4 compliant autoloader for SwiftCurrency plugin.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Autoloader class.
 *
 * @class Autoloader
 * @version 1.0.0
 */
class Autoloader {

	/**
	 * Namespace prefix.
	 *
	 * @var string
	 */
	private static $namespace_prefix = 'Codeies\\SwiftCurrency\\';

	/**
	 * Base directory for the namespace prefix.
	 *
	 * @var string
	 */
	private static $base_dir;

	/**
	 * Initialize the autoloader.
	 */
	public static function init() {
		self::$base_dir = SWIFTCURRENCY_INCLUDES_DIR;
		spl_autoload_register( array( __CLASS__, 'autoload' ) );
	}

	/**
	 * Autoload classes.
	 *
	 * @param string $class The fully-qualified class name.
	 */
	public static function autoload( $class ) {
		// Check if the class uses the namespace prefix.
		$len = strlen( self::$namespace_prefix );
		if ( strncmp( self::$namespace_prefix, $class, $len ) !== 0 ) {
			return;
		}

		// Get the relative class name.
		$relative_class = substr( $class, $len );

		// Convert namespace separators to directory separators.
		$relative_class = str_replace( '\\', DIRECTORY_SEPARATOR, $relative_class );

		// Convert class name to file name format.
		$file_name = self::get_file_name_from_class( $relative_class );

		// Build the file path.
		$file = self::$base_dir . $file_name;

		// If the file exists, require it.
		if ( file_exists( $file ) ) {
			require_once $file;
		}
	}

	/**
	 * Convert class name to file name.
	 *
	 * Converts:
	 * - Currency_Manager -> class-currency-manager.php
	 * - Admin\Admin_Settings -> admin/class-admin-settings.php
	 * - Providers\OpenExchangeRates -> providers/class-openexchangerates.php
	 * - Providers\Rate_Provider_Interface -> providers/interface-rate-provider.php
	 *
	 * @param string $class_name The class name.
	 * @return string The file name.
	 */
	private static function get_file_name_from_class( $class_name ) {
		// Split by directory separator.
		$parts = explode( DIRECTORY_SEPARATOR, $class_name );

		// Get the class name (last part).
		$class = array_pop( $parts );

		// Check if it's an interface.
		$is_interface = ( strpos( $class, '_Interface' ) !== false );

		// Convert class name to file name.
		// Currency_Manager -> currency-manager
		// Rate_Provider_Interface -> rate-provider
		if ( $is_interface ) {
			// Remove _Interface suffix.
			$class = str_replace( '_Interface', '', $class );
		}
		
		$file_name = strtolower( str_replace( '_', '-', $class ) );

		// Add appropriate prefix.
		$prefix = $is_interface ? 'interface-' : 'class-';
		$file_name = $prefix . $file_name . '.php';

		// If there are directory parts, add them.
		if ( ! empty( $parts ) ) {
			$directory = strtolower( implode( DIRECTORY_SEPARATOR, $parts ) );
			$file_name = $directory . DIRECTORY_SEPARATOR . $file_name;
		}

		return $file_name;
	}
}

// Initialize the autoloader.
Autoloader::init();
