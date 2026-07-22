<?php
namespace Gutenkit\Routes;

defined( 'ABSPATH' ) || exit;

/**
 * Routes registrar.
 *
 * Initializes all of the GutenKit REST API route classes.
 *
 * @since 2.4.8
 * @access public
 */
class Init {

	use \Gutenkit\Traits\Singleton;

	/**
	 * class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 2.4.8
	 */
	public function __construct() {
		// Upload media files from a URL.
		new \Gutenkit\Routes\MediaUploadFromUrl();

		// Configure the plugin's global settings.
		new \Gutenkit\Routes\GlobalSettings();

		// Receive deactivation reason data from the plugins-page modal.
		new \Gutenkit\Routes\DeactivationFeedback();

		// Register the MailChimp route.
		new \Gutenkit\Routes\MailChimp();
	}
}
