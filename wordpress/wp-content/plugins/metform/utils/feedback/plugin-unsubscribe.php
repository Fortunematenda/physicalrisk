<?php
/**
 * Plugin Unsubscribe / Deactivation Feedback Handler
 *
 * Renders a feedback modal on plugin deactivation, collects user input,
 * and sends telemetry to the MetForm API.
 *
 * @package MetForm\Utils\Feedback
 * @since   1.0.0
 */

namespace MetForm\Utils\Feedback;

use MetForm\Plugin;
use WP_Error;

defined( 'ABSPATH' ) || exit;

class Plugin_Unsubscribe {

	/**
	 * Constructor.
	 *
	 * Registers all admin-side hooks required by this feature.
	 *
	 * @since 1.0.0
	 */
	public function __construct() {
		if ( ! is_admin() ) {
			return;
		}

		add_action( 'admin_footer',          array( $this, 'render_modal' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );

		add_action( 'wp_ajax_metform_deactivation_feedback',     array( $this, 'handle_feedback' ) );
	}


	/**
	 * Enqueue CSS and JS assets for the deactivation feedback modal.
	 *
	 * Passes localised data (nonce, AJAX URL, plugin URL)
	 * to the front-end script via {@see wp_localize_script()}.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function enqueue_scripts( $hook_suffix ) {
		if ( 'plugins.php' !== $hook_suffix ) {
			return;
		}

		$plugin_url = Plugin::instance()->plugin_url();
		$version    = Plugin::instance()->version();

		wp_enqueue_style(
			'metform-deactivation-modal',
			$plugin_url . 'utils/feedback/assets/css/metform-deactivation-modal.css',
			array(),
			$version
		);

		wp_enqueue_script(
			'metform-deactivation-modal',
			$plugin_url . 'utils/feedback/assets/js/metform-deactivation-modal.js',
			array( 'jquery' ),
			$version,
			true
		);

		wp_localize_script(
			'metform-deactivation-modal',
			'MetFormDeactivation',
			array(
				'nonce'      => wp_create_nonce( 'metform-deactivation' ),
				'ajaxurl'    => admin_url( 'admin-ajax.php' ),
				'plugin_url' => $plugin_url,
			)
		);
	}


	/**
	 * Output the deactivation feedback modal markup in the admin footer.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function render_modal() {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

		if ( ! $screen || 'plugins' !== $screen->id ) {
			return;
		}

		$reasons = $this->get_deactivation_reasons();
		?>
		<div id="mf-deactivation-modal" class="mf-deactivation-modal">
			<div class="mf-deactivation-content">

				<?php $this->render_modal_header(); ?>

				<div class="mf-deactivation-body">
					<div id="mf-deactivation-error-message" class="mf-deactivation-error-message" style="display: none;"></div>

					<h2 class="mf-deactivation-title">
						<?php esc_html_e( 'Before you go, what made you deactivate MetForm?', 'metform' ); ?>
					</h2>

					<form id="mf-deactivation-form" class="mf-deactivation-form">
						<input type="hidden" name="metform_nonce" value="<?php echo esc_attr( wp_create_nonce( 'metform-deactivation' ) ); ?>" />

						<div class="mf-deactivation-radio-group">
							<?php foreach ( $reasons as $reason ) : ?>
								<?php $this->render_reason_item( $reason ); ?>
							<?php endforeach; ?>
						</div>

						<?php $this->render_modal_footer(); ?>

					</form>
				</div><!-- .mf-deactivation-body -->

			</div><!-- .mf-deactivation-content -->
		</div><!-- #mf-deactivation-modal -->
		<?php
	}


	/**
	 * Handle the AJAX feedback-submission request.
	 *
	 * Verifies the nonce and user capabilities, collects payload data,
	 * then dispatches the data to the remote API via {@see send_feedback_data()}.
	 *
	 * Sends a JSON error response on failure; a JSON success response otherwise.
	 *
	 * @since 1.0.0
	 *
	 * @return void Terminates execution via {@see wp_send_json_error()} or
	 *              {@see wp_send_json_success()}.
	 */
	public function handle_feedback() {
		$this->verify_request();

		$selected_reason = isset( $_POST['reason'] )
			? sanitize_text_field( wp_unslash( $_POST['reason'] ) )
			: '';

		$data = array(
			'plugin_slug'    => 'metform',
			'plugin_name'    => 'MetForm',
			'plugin_version' => Plugin::instance()->version(),
			'user'           => array(
				'email' => $this->get_user_email(),
			),
			'feedback'       => array(
				'reason_key'   => isset( $_POST['reason_key'] ) ? sanitize_text_field( wp_unslash( $_POST['reason_key'] ) ) : 'other',
				'reason_label' => isset( $_POST['reason_label'] ) ? sanitize_text_field( wp_unslash( $_POST['reason_label'] ) ) : $selected_reason,
				'message'      => isset( $_POST['feedback'] )? sanitize_textarea_field( wp_unslash( $_POST['feedback'] ) ) : '',
			),
			'usage'          => array(
				'user_type'      => $this->get_user_type(),
				'active_days'    => $this->get_days_active(),
			),
			'environment'    => array(
				'multisite_status'   => is_multisite(),
				'wp_version'         => get_bloginfo( 'version' ),
				'php_version'        => PHP_VERSION,
				'elementor_version'  => defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : '',
				'site_url'           => get_site_url(),
			),
		);

		$response = $this->send_feedback_data( $data );

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array( 'message' => $response->get_error_message() ) );
		}

		$response_code = (int) wp_remote_retrieve_response_code( $response );
		if ( $response_code < 200 || $response_code >= 300 ) {
			wp_send_json_error(
				array(
					'message' => esc_html__( 'Failed to submit feedback.', 'metform' ),
					'code'    => $response_code,
				)
			);
		}

		wp_send_json_success(
			array( 'message' => esc_html__( 'Thank you for your feedback!', 'metform' ) )
		);
	}


	/**
	 * Output the modal header, including the MetForm logo SVG and title.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function render_modal_header() {
		?>
		<div class="mf-deactivation-header">
			<h2>
				<svg class="mf-deactivation-logo" width="36" height="30" viewBox="0 0 33 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
					<path d="M33.0867 11.0338L26.2037 11.5706V3.1014C26.2037 1.37178 24.8151 0 23.0641 0H3.13962C1.38868 0 0 1.37178 0 3.1014V17.177L8.87546 22.5447L33.0867 11.0338Z" fill="url(#mf_paint0)"/>
					<path d="M8.99687 28.4493L0.0610352 17.1769V26.8986C0.0610352 28.6282 1.44971 30 3.20065 30H23.1252C24.8761 30 26.2648 28.6282 26.2648 26.8986V19.324L33.1478 11.1531L8.99687 28.4493Z" fill="url(#mf_paint1)"/>

					<!-- Form lines -->
					<rect x="4" y="4" width="1.6" height="1.6" rx="0.8" fill="white"/>
					<rect x="7" y="4.3" width="11" height="1" rx="0.5" fill="white"/>
					<rect x="4" y="7.5" width="1.6" height="1.6" rx="0.8" fill="white"/>
					<rect x="7" y="7.8" width="9" height="1" rx="0.5" fill="white"/>
					<rect x="4" y="11" width="1.6" height="1.6" rx="0.8" fill="white"/>
					<rect x="7" y="11.3" width="10" height="1" rx="0.5" fill="white"/>

					<!-- Checkmark -->
					<polyline points="5.5,23 9,26.5 15.5,19" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

					<defs>
						<linearGradient id="mf_paint0" x1="6.07564" y1="21.0648" x2="21.5844" y2="-0.929494" gradientUnits="userSpaceOnUse">
							<stop stop-color="#F8003C"/>
							<stop offset="1" stop-color="#FF8438"/>
						</linearGradient>
						<linearGradient id="mf_paint1" x1="0.721864" y1="28.075" x2="25.5087" y2="17.7559" gradientUnits="userSpaceOnUse">
							<stop offset="0.1645" stop-color="#0099AC"/>
							<stop offset="0.9996" stop-color="#00D5C9"/>
						</linearGradient>
					</defs>
				</svg>
				<span><?php esc_html_e( 'Quick Feedback', 'metform' ); ?></span>
			</h2>

			<button type="button" class="mf-deactivation-close" aria-label="<?php esc_attr_e( 'Close', 'metform' ); ?>">
				<span aria-hidden="true">&times;</span>
			</button>
		</div><!-- .mf-deactivation-header -->
		<?php
	}

	/**
	 * Output a single radio-option item inside the feedback form.
	 *
	 * Each item consists of a radio button, its label, hidden key/label inputs,
	 * and an optional follow-up textarea.
	 *
	 * @since 1.0.0
	 *
	 * @param array $reason {
	 *     Associative array describing a single deactivation reason.
	 *
	 *     @type string $value       The radio button value / display label.
	 *     @type string $key         Programmatic key sent with the AJAX request.
	 *     @type string $label       Human-readable label sent with the AJAX request.
	 *     @type string $placeholder Placeholder text for the follow-up textarea.
	 * }
	 * @return void
	 */
	private function render_reason_item( array $reason ) {
		$reason_key  = esc_attr( $reason['key'] );
		?>
		<div class="mf-deactivation-radio-item" data-reason-key="<?php echo esc_attr( $reason['key'] ); ?>">
			<label class="mf-deactivation-radio-option">
				<input
					type="radio"
					name="reason"
					value="<?php echo esc_attr( $reason['value'] ); ?>"
					class="mf-form-control-radio"
				>
				<span><?php echo esc_html( $reason['value'] ); ?></span>
			</label>
			<input type="hidden" class="mf-reason-key"   value="<?php echo esc_attr( $reason['key'] ); ?>" />
			<input type="hidden" class="mf-reason-label" value="<?php echo esc_attr( $reason['label'] ); ?>" />
			<textarea
				name="feedback_<?php echo $reason_key; ?>"
				class="mf-deactivation-radio-feedback"
				placeholder="<?php echo esc_attr( $reason['placeholder'] ); ?>"
				rows="2"
			></textarea>
		</div>
		<?php
	}

	/**
	 * Output the modal footer containing the action buttons.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function render_modal_footer() {
		?>
		<div class="mf-deactivation-footer">
			<button type="button" class="mf-btn mf-btn-secondary mf-deactivation-skip" data-deactivate-link="">
				<?php esc_html_e( 'Skip & Deactivate', 'metform' ); ?>
			</button>
			<button type="submit" class="mf-btn mf-btn-primary mf-deactivation-submit">
				<?php esc_html_e( 'Submit & Deactivate', 'metform' ); ?>
			</button>
		</div><!-- .mf-deactivation-footer -->
		<?php
	}


	/**
	 * Verify AJAX request nonce and user capabilities.
	 *
	 * Sends a JSON error response and terminates execution if either check fails.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function verify_request() {
		$nonce = isset( $_POST['metform_nonce'] )
			? sanitize_key( wp_unslash( $_POST['metform_nonce'] ) )
			: '';

		if ( ! wp_verify_nonce( $nonce, 'metform-deactivation' ) ) {
			wp_send_json_error(
				array( 'message' => esc_html__( 'Security check failed', 'metform' ) )
			);
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error(
				array( 'message' => esc_html__( 'Insufficient permissions', 'metform' ) )
			);
		}
	}




	/**
	 * Send collected feedback data to the MetForm remote API.
	 *
	 * @since 1.0.0
	 *
	 * @param array $data Associative array of feedback payload data.
	 * @return array|\WP_Error The raw HTTP response array, or a WP_Error on failure.
	 */
	private function send_feedback_data( array $data ) {
		// Plugin class does not expose an api_url() helper. Use the WPMet public API endpoint.
		$url = 'https://api.wpmet.com/public/plugin-unsubscribe/';
		return wp_remote_post(
			$url,
			array(
				'method'  => 'POST',
				'timeout' => 20,
				'headers' => array(
					'Content-Type' => 'application/json',
				),
				'body'    => wp_json_encode( $data ),
			)
		);
	}

	/**
	 * Return the number of days the plugin has been active.
	 *
	 * Reads the `metform_install_date` option and computes the
	 * difference between that date and the current server time.
	 *
	 * @since 1.0.0
	 *
	 * @return int Number of complete days since installation, or 0 if unknown.
	 */
	private function get_days_active() {
		$installed_time = get_option( 'metform_install_date' );

		if ( ! $installed_time ) {
			return 0;
		}

		$installed_timestamp = strtotime( $installed_time );
		$current_time        = current_time( 'timestamp' ); // phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested

		return (int) floor( ( $current_time - $installed_timestamp ) / DAY_IN_SECONDS );
	}

	/**
	 * Return the current user's license/subscription type.
	 *
	 * Possible return values:
	 * - `'pro_valid'`  – Pro plugin is active with a valid licence.
	 * - `'pro'`        – Pro plugin is installed but licence is missing or invalid.
	 * - `'free'`       – Only the Lite version is installed.
	 *
	 * @since 1.0.0
	 *
	 * @return string One of `'pro_valid'`, `'pro'`, or `'free'`.
	 */
	private function get_user_type() {
		if ( 'pro' !== Plugin::instance()->package_type() ) {
			return 'free';
		}

		return 'valid' === Plugin::instance()->license_status() ? 'pro_valid' : 'pro';
	}

	/**
	 * Return the admin email address stored in plugin options, if available.
	 *
	 * @since 1.0.0
	 *
	 * @return string A sanitized email address, or an empty string when not set.
	 */
	private function get_user_email() {
		$options = get_option( 'metform_options', array() );

		if ( empty( $options['settings']['newsletter_email'] ) ) {
			return '';
		}

		return sanitize_email( $options['settings']['newsletter_email'] );
	}


	/**
	 * Return the list of available deactivation reasons shown in the modal.
	 *
	 * Each entry is an associative array with the following keys:
	 * - `value`       (string) The user-visible radio-button label.
	 * - `key`         (string) The programmatic key sent to the API.
	 * - `label`       (string) The human-readable label sent to the API.
	 * - `placeholder` (string) Placeholder text for the follow-up textarea.
	 *
	 * @since 1.0.0
	 *
	 * @return array[] List of reason definition arrays.
	 */
	private function get_deactivation_reasons() {
		return array(
			array(
				'value'       => __( 'I no longer need the plugin', 'metform' ),
				'key'         => 'no_longer_needed',
				'label'       => 'I no longer need the plugin',
				'placeholder' => __( 'Tell us more...', 'metform' ),
			),
			array(
				'value'       => __( 'I found a better plugin', 'metform' ),
				'key'         => 'found_better_plugin',
				'label'       => 'I found a better plugin',
				'placeholder' => __( 'Which plugin are you using instead?', 'metform' ),
			),
			array(
				'value'       => __( "I couldn't get the plugin to work", 'metform' ),
				'key'         => 'plugin_bug',
				'label'       => "I couldn't get the plugin to work",
				'placeholder' => __( 'What specific issue did you face?', 'metform' ),
			),
			array(
				'value'       => __( "It's missing a specific feature", 'metform' ),
				'key'         => 'missing_feature',
				'label'       => "It's missing a specific feature",
				'placeholder' => __( 'What feature do you need?', 'metform' ),
			),
			array(
				'value'       => __( 'The plugin affects site performance', 'metform' ),
				'key'         => 'performance_issue',
				'label'       => 'Slowing down my site',
				'placeholder' => __( 'Please share details about the performance issues you experienced...', 'metform' ),
			),
			array(
				'value'       => __( "It's a temporary deactivation", 'metform' ),
				'key'         => 'temporary_deactivation',
				'label'       => "It's a temporary deactivation",
				'placeholder' => __( 'When will you reactivate it?', 'metform' ),
			),
			array(
				'value'       => __( 'Other', 'metform' ),
				'key'         => 'other',
				'label'       => 'Other',
				'placeholder' => __( 'Please tell us why...', 'metform' ),
			),
		);
	}
}
