<?php

namespace EmailKit\Admin\MetaField;

defined('ABSPATH') || exit;

use WC_Shipping_Zones;

class StyleLoad
{
	const EMAILKIT_ICON_BASE_URL = EMAILKIT_URL . "assets/Images/";
	private $emailKit;

	public function __construct()
	{
		add_action('init', function () {
			add_action('wp_enqueue_scripts', [$this, 'addEnqueue']);
		});
	}


	public function addEnqueue()
	{
		$this->builder_data();

		?>

		<script id="__NEXT_DATA__" type="application/json">
			{
				"props": {
					"pageProps": {}
				},
				"page": "/",
				"query": {},
				"buildId": "BNHEjAAqfCFPc8hjndtt6",
				"assetPrefix": ".",
				"nextExport": true,
				"autoExport": true,
				"isFallback": false
			}
		</script>
		<?php


		
		// $response = wp_remote_get(EMAILKIT_URL . 'build/build-manifest.json');

		// if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
		// 	$json_data = wp_remote_retrieve_body($response);
		// 	$json_data = json_decode($json_data, true);

		// 	if('' ==$json_data || !is_array($json_data)) {
		// 		return;
		// 	}
		// 	if ($json_data && is_array($json_data)) {
				
		// 		$scripts = $json_data["js"];
		// 		$styles = $json_data["css"];

		// 		foreach ($scripts as $index => $script) {
		// 			wp_enqueue_script("emailkit-js" . $index, EMAILKIT_URL . $script, ['wp-plugins', 'wp-edit-post', 'wp-i18n', 'wp-element', 'wp-dom', 'wp-data'], EMAILKIT_VERSION, true);
		// 		}
		// 		foreach ($styles as $index => $style) {
		// 			wp_enqueue_style("emailkit-css" . $index, EMAILKIT_URL . $style, [], EMAILKIT_VERSION);
		// 		}
		// 	} 
		// }
		
		wp_enqueue_media();
		wp_enqueue_style('media');
		wp_enqueue_script("emailkit-js", EMAILKIT_URL . 'dist/app.js', ['wp-plugins', 'wp-edit-post', 'wp-i18n', 'wp-element', 'wp-dom', 'wp-data'], EMAILKIT_VERSION, true);
		wp_enqueue_style("emailkit-css", EMAILKIT_URL . 'dist/app.css', [], EMAILKIT_VERSION);
		if (is_admin()) {
			wp_enqueue_style('emailkit-admin-style', EMAILKIT_URL . 'assets/dist/admin/styles/email-builder-navbar.css', [], EMAILKIT_VERSION);
		}
		
		wp_set_script_translations('emailkit-js', 'emailkit', EMAILKIT_DIR . 'languages');
	}

	public function builder_data()
	{
		//add_filter('show_admin_bar', '__return_false');

		// Remove all WordPress actions
		//remove_all_actions('wp_head');
		remove_all_actions('wp_print_styles');
		/* remove_all_actions('wp_print_head_scripts');
		remove_all_actions('wp_footer');

		// Handle `wp_enqueue_scripts`
		remove_all_actions('wp_enqueue_scripts');
		remove_all_actions('after_wp_tiny_mce');

		// Handle `wp_head`
		add_action('wp_head', 'wp_enqueue_scripts', 1);
		add_action('wp_head', 'wp_print_styles', 8);
		add_action('wp_head', 'wp_print_head_scripts', 9);
		add_action('wp_head', 'wp_site_icon');


		// Handle `wp_footer`
		add_action('wp_footer', 'wp_print_footer_scripts', 20);
		add_action('wp_footer', 'wp_auth_check_html', 30); */

		// Entry theme style conflict with emailkit
		if ( isset($_GET['action']) && $_GET['action'] == 'emailkit-builder' && get_template() == 'entry' ) {
			add_action( 'wp_print_styles', function() {
				wp_dequeue_style('bootstrap');
				wp_dequeue_style('swg-css');
			}, 100);
		}

		// Hello Elementor theme style conflict with emailkit
			if ( get_template() == 'hello-elementor' ) {
				wp_dequeue_style('hello-elementor');
				
			} 

			// Flatsome theme style conflict with emailkit
			else if(isset($_GET['action']) && $_GET['action'] == 'emailkit-builder' && get_template() == 'flatsome' ) {

				add_action( 'wp_print_styles', function() {
					wp_dequeue_style('flatsome-main');
					
				});

				?>
				<style>
				.mobile-sidebar,
				.no-scrollbar,
				.mfp-hide {
					display: none !important;
				}
				</style>
				<?php
			}

		$copy_paste_enabled = \EmailKit\Promotional\Util::get_settings('emailkit_enable_copy_paste', 'no');
		$_nonce = wp_create_nonce('wp_rest');
		$post_id = isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : ''; //phpcs:ignore WordPress.Security.NonceVerification -- Nonce can't be added in CPT edit page URL
		$is_emailkit_pro_active = is_plugin_active('emailkit-pro/emailkit-pro.php');
		$is_shipping_zone_available = class_exists('WC_Shipping_Zones') ? !empty(WC_Shipping_Zones::get_zones()) : false;
        $config = [
            'version' => EMAILKIT_VERSION,
            'restNonce' => esc_attr($_nonce),
            'siteUrl'   => esc_url(get_site_url()),
            'assetsUrl' => esc_url(EMAILKIT_URL . 'assets/'),
            'baseApi'   => esc_url(get_rest_url(null, 'emailkit/v1/')),
            'baseUrl'   => esc_url(EMAILKIT_URL),
			'adminUrl' => esc_url(admin_url()),
			'adminEmail'     => get_option('admin_email'),
            'post_id'   => $post_id,
			'template_status' => get_post_meta($post_id,'emailkit_template_status',true),
			'template_type' => get_post_meta($post_id,'emailkit_template_type',true),
			'email_type' => get_post_meta($post_id,'emailkit_email_type',true),
			'is_emailkit_pro_active' => ($is_emailkit_pro_active ? true : false),
			'isWoocommreceActivate' => is_plugin_active('woocommerce/woocommerce.php') ? 'active' : 'inactive',
			'isShippingZoneAvailable' => $is_shipping_zone_available ? 'active' : 'inactive',
			'iconBaseUrl' => self::EMAILKIT_ICON_BASE_URL,
			'copyPasteEnabled' => ($is_emailkit_pro_active && $copy_paste_enabled == 'yes') ? true : false,
        ];

		

		?>
				<script>
					localStorage.removeItem('editorState');
					window.emailKit = window.emailKit ?? {};
					window.emailKit.config = <?php echo wp_json_encode($config); ?>;
				</script>
		<?php
	}
}
