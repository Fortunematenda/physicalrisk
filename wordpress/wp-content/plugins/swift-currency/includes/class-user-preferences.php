<?php
/**
 * User Preferences Class
 *
 * Manages user currency preferences across sessions.
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
 * User Preferences class.
 *
 * @class User_Preferences
 * @version 1.0.0
 */
class User_Preferences {

	/**
	 * Settings instance.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Currency Manager instance.
	 *
	 * @var Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Cookie name.
	 *
	 * @var string
	 */
	const COOKIE_NAME = 'swiftcurrency_selected';

	/**
	 * User meta key.
	 *
	 * @var string
	 */
	const USER_META_KEY = 'swiftcurrency_preferred_currency';

	/**
	 * Constructor.
	 *
	 * @param Settings         $settings         Settings instance.
	 * @param Currency_Manager $currency_manager Currency Manager instance.
	 */
	public function __construct( $settings, $currency_manager ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->init_hooks();
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks() {
		// Save preference when currency is switched.
		add_action( 'swiftcurrency_after_currency_switch', array( $this, 'save_preference' ), 10, 2 );

		// Load saved preference on init.
		add_action( 'init', array( $this, 'load_saved_preference' ), 20 );
	}

	/**
	 * Save currency preference.
	 *
	 * @param string $old_currency Previous currency.
	 * @param string $new_currency New currency.
	 */
	public function save_preference( $old_currency, $new_currency ) {
		if ( ! $this->settings->get( 'general', 'save_user_preference', true ) ) {
			return;
		}

		// Save to cookie.
		$this->save_to_cookie( $new_currency );

		// Save to user meta if logged in.
		if ( is_user_logged_in() ) {
			$this->save_to_user_meta( $new_currency );
		}
	}

	/**
	 * Load saved preference.
	 */
	public function load_saved_preference() {
		if ( ! $this->settings->get( 'general', 'save_user_preference', true ) ) {
			return;
		}

		// Check if already set in session.
		if ( WC()->session && WC()->session->get( 'swiftcurrency_current' ) ) {
			return;
		}

		$saved_currency = $this->get_saved_preference();

		if ( $saved_currency && $this->currency_manager->is_currency_enabled( $saved_currency ) ) {
			// Set in session.
			if ( WC()->session ) {
				WC()->session->set( 'swiftcurrency_current', $saved_currency );
			}
		}
	}

	/**
	 * Get saved preference.
	 *
	 * @return string|false Currency code or false.
	 */
	public function get_saved_preference() {
		// Try user meta first (for logged-in users).
		if ( is_user_logged_in() ) {
			$user_preference = $this->get_from_user_meta();
			if ( $user_preference ) {
				return $user_preference;
			}
		}

		// Try cookie.
		return $this->get_from_cookie();
	}

	/**
	 * Save to cookie.
	 *
	 * @param string $currency_code Currency code.
	 * @return bool
	 */
	private function save_to_cookie( $currency_code ) {
		$expiration = time() + ( 30 * DAY_IN_SECONDS );

		return setcookie(
			self::COOKIE_NAME,
			$currency_code,
			$expiration,
			COOKIEPATH,
			COOKIE_DOMAIN,
			is_ssl(),
			true // HTTP only
		);
	}

	/**
	 * Get from cookie.
	 *
	 * @return string|false Currency code or false.
	 */
	private function get_from_cookie() {
		if ( isset( $_COOKIE[ self::COOKIE_NAME ] ) ) {
			$currency = sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE_NAME ] ) );

			// Validate currency.
			if ( $this->currency_manager->is_currency_enabled( $currency ) ) {
				return $currency;
			}
		}

		return false;
	}

	/**
	 * Save to user meta.
	 *
	 * @param string $currency_code Currency code.
	 * @return bool
	 */
	private function save_to_user_meta( $currency_code ) {
		$user_id = get_current_user_id();

		if ( ! $user_id ) {
			return false;
		}

		return update_user_meta( $user_id, self::USER_META_KEY, $currency_code );
	}

	/**
	 * Get from user meta.
	 *
	 * @return string|false Currency code or false.
	 */
	private function get_from_user_meta() {
		$user_id = get_current_user_id();

		if ( ! $user_id ) {
			return false;
		}

		$currency = get_user_meta( $user_id, self::USER_META_KEY, true );

		if ( $currency ) {
			// Validate currency.
			if ( $this->currency_manager->is_currency_enabled( $currency ) ) {
				return $currency;
			}
		}

		return false;
	}

	/**
	 * Clear preference.
	 *
	 * @return bool
	 */
	public function clear_preference() {
		// Clear cookie.
		setcookie(
			self::COOKIE_NAME,
			'',
			time() - 3600,
			COOKIEPATH,
			COOKIE_DOMAIN
		);

		// Clear user meta if logged in.
		if ( is_user_logged_in() ) {
			$user_id = get_current_user_id();
			delete_user_meta( $user_id, self::USER_META_KEY );
		}

		return true;
	}

	/**
	 * Check if user has saved preference.
	 *
	 * @return bool
	 */
	public function has_saved_preference() {
		return (bool) $this->get_saved_preference();
	}
}
