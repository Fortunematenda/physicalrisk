<?php

/**
 * The plugin bootstrap file
 *
 * This file is read by WordPress to generate the plugin information in the plugin
 * admin area. This file also includes all of the dependencies used by the plugin,
 * registers the activation and deactivation functions, and defines a function
 * that starts the plugin.
 *
 * @link              https://posimyth.com
 * @since             1.0.0
 * @package           Protuno
 *
 * @wordpress-plugin
 * Plugin Name:       Protuno
 * Plugin URI:        https://posimyth.com
 * Description:       One widget for your website. Build with AI at its full potential. From pages and posts to templates and layouts, create anything.
 * Version:           1.0.0
 * Author:            Posimyth
 * Author URI:        https://posimyth.com/
 * License:           GPL-2.0+
 * License URI:       http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain:       protuno
 * Domain Path:       /languages
 * Requires at least: 6.6
 * Requires PHP:      7.4
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * Currently plugin version.
 * Start at version 1.0.0 and use SemVer - https://semver.org
 * Rename this for your plugin and update it as you release new versions.
 */
define( 'PROTUNO_VERSION', '1.0.0' );
define( 'PROTUNO_FILE', __FILE__ );
define( 'PROTUNO_PATH', plugin_dir_path( __FILE__ ) );
define( 'PROTUNO_URL', plugins_url( '/', __FILE__ ) );
define( 'PROTUNO_BDNAME', basename( __DIR__ ) );
define( 'PROTUNO_PBNAME', plugin_basename( __FILE__ ) );

/**
 * The code that runs during plugin activation.
 * This action is documented in includes/class-protuno-activator.php
 */
function activate_protuno() {
	require_once plugin_dir_path( __FILE__ ) . 'includes/class-protuno-activator.php';
	Protuno_Activator::activate();
}

/**
 * The code that runs during plugin deactivation.
 * This action is documented in includes/class-protuno-deactivator.php
 */
function deactivate_protuno() {
	require_once plugin_dir_path( __FILE__ ) . 'includes/class-protuno-deactivator.php';
	Protuno_Deactivator::deactivate();
}

register_activation_hook( __FILE__, 'activate_protuno' );
register_deactivation_hook( __FILE__, 'deactivate_protuno' );

/**
 * The core plugin class that is used to define internationalization,
 * admin-specific hooks, and public-facing site hooks.
 */
require plugin_dir_path( __FILE__ ) . 'includes/class-protuno.php';

/**
 * Begins execution of the plugin.
 *
 * Since everything within the plugin is registered via hooks,
 * then kicking off the plugin from this point in the file does
 * not affect the page life cycle.
 *
 * @since    1.0.0
 */
function run_protuno() {

	$plugin = new Protuno();
	$plugin->run();

}
run_protuno();
