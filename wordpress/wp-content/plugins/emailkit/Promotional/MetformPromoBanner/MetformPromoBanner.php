<?php

namespace EmailKit\Promotional\MetformPromoBanner;

use Wpmet\UtilityPackage\Notice\Notice as LibsNotice;

defined('ABSPATH') || exit;

if (!class_exists('\EmailKit\Promotional\MetformPromoBanner\MetformPromoBanner')) {

	class MetformPromoBanner
	{

		private $is_already_installed = '';

		/**
		 * Constructor for initializing the class.
		 * 
		 * @access public
		 * @return void
		 */
		public function __construct()
		{

			do_action('metform_promo_banner_loaded');

			if (empty($_GET['post_type']) || 'emailkit' !== $_GET['post_type']) {
				return;
			}

			if (!function_exists('get_plugins')) {
				include_once  ABSPATH . 'wp-admin/includes/plugin.php';
			}

			$installed_plugins = get_plugins();
			$this->is_already_installed = isset($installed_plugins['metform/metform.php']) ? 1 : 0;

			$message = '
			
			<div class="metform-promo-banner-wrapper">
				<div class="metform-promo-banner-banner-left">
					<div class="metform-promo-banner-banner-main">
						<div class="metform-promo-banner-banner-logo">
							<img src="' . plugin_dir_url(__FILE__) . '/assets/logo.svg" />
						</div>
						<div class="metform-promo-banner-banner-middle">
							<div class="metform-promo-banner-banner-title">Boost Engagement with Custom Forms! 🚀</div>
							<p>Struggling to grow your email list? Get <strong>FREE high-converting form templates</strong> designed to capture more leads, boost engagement, and turn visitors into loyal subscribers. 📩✨</p>
						</div>
					</div>
				</div>
				<div class="metform-promo-banner-banner-right">
					<span class="metform-promo-banner-icon">
						<abbr title="MetForm requires! Clicking the button will download MetForm and unlock all form templates.">
						<div>
						<span class="dashicons dashicons-info-outline"></span>
						</div>
							<div class="tooltip">
        MetForm requires! Clicking the button will download MetForm and unlock all form templates.
      </div>
						</abbr>
					</span>
					<div class="metform-install-activate-btn">Try Free Templates</div>
					
				</div>
			</div>';

			$dismissed_coutner = get_option('shopengine-metform_get_free_templates_banner_dismissed_' . get_current_user_id(), 0);
			$notice_showing_delay_time = (3600 * 24 * 15);

			if ($dismissed_coutner == 1) {
				$notice_showing_delay_time = (3600 * 24 * 30);
			} elseif ($dismissed_coutner == 2) {
				$notice_showing_delay_time = (3600 * 24 * 180);
			} elseif ($dismissed_coutner >= 3) {
				$notice_showing_delay_time = (3600 * 24 * 99999);
			}

			LibsNotice::instance('shopengine', 'metform_get_free_templates_banner')
				->set_dismiss('user', $notice_showing_delay_time)
				->set_message($message)
				->call();

			add_action('admin_head', [$this, 'metform_promotion_admin_head']);
		}

		public function metform_promotion_admin_head()
		{
?>
			<style>
				.notice-shopengine-metform_get_free_templates_banner {
					background-image: url("<?php echo esc_url(plugin_dir_url(__FILE__) . '/assets/line_wp.svg') ?>") !important;
					background-size: cover !important;
					background-repeat: no-repeat !important;
					background-position: center center !important;
					border: none !important;
					color: #ffffff;
					font-family: "Roboto", sans-serif;
					background-color: #1249D9;
				}

				.notice-shopengine-metform_get_free_templates_banner .metform-promo-banner-banner-main {
					display: flex;
					gap: 15px;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width {
					padding: 0;
					margin: 0 !important;
					box-shadow: 0px 1px 4px 0px #070B164D;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-right {
					display: flex;
					align-items: center;
					margin-right: 50px;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-right .metform-promo-banner-icon abbr {
					text-decoration: none;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-right .metform-promo-banner-icon abbr span {
					margin-right: 15px;
					cursor: pointer;
					color: #B0C5FA;
					transition: all 0.3s ease-in-out;
				}
				.notice-shopengine-metform_get_free_templates_banner button.notice-dismiss {
					padding: 0;
					margin: 6px;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-right .metform-promo-banner-icon abbr span:hover {
					color: #ffffff;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-left .metform-promo-banner-banner-main .metform-promo-banner-banner-logo {
					padding: 24px 8px 0px 8px;
					border-left: 6px solid #EEFF25;
					background: #2A5BDD;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-left .metform-promo-banner-banner-middle {
					padding: 20px 4px;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-left .metform-promo-banner-banner-middle  p{
					padding-bottom: 0;
					margin-bottom: 0;
				}

				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-right .metform-install-activate-btn {
					font-size: 14px;
					font-weight: 500;
					padding: 12px 20px 10px;
					background: #EEFF25;
					color: #000000;
					cursor: pointer;
					border-radius: 4px;
					transition: all 0.3s ease-in-out;
				}
				.notice-shopengine-metform_get_free_templates_banner .notice-container-full-width .metform-promo-banner-wrapper .metform-promo-banner-banner-right .metform-install-activate-btn:hover{
					background-color: #ffffff;
					color: #000;
				}
				.metform-promo-banner-banner-title {
					font-size: 24px;
					font-weight: 600;
					margin-bottom: 8px;
					margin-top: 6px;
					letter-spacing: 0.1px;
				}
				.notice-shopengine-metform_get_free_templates_banner button.notice-dismiss:focus {
					outline: none !important;
					box-shadow: none !important;
				}
				.notice-shopengine-metform_get_free_templates_banner button.notice-dismiss::before {
					content: "\f335";
					color: #8BAAF6;
					transition: all 0.3s ease-in-out;
					font-size: 20px;
				}
				.notice-shopengine-metform_get_free_templates_banner button.notice-dismiss:hover::before {
					color: #ffffff
				}
				.metform-promo-banner-icon {
					position: relative;
					display: inline-block;
				}
				.tooltip {
					visibility: hidden;
					position: absolute;
					bottom: calc(100% + 15px);
					right:15%;
					background-color: #1a1f2d;
					color: white;
					padding: 12px 16px;
					border-radius: 4px;
					font-size: 14px;
					font-weight: 400;
					font-family: sans-serif;
					width: 256px;;
					box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
					opacity: 0;
					transition: opacity 0.2s, visibility 0.2s;
				}

				/* Triangle pointer */
				.tooltip::after {
					content: '';
					position: absolute;
					top: 100%;
					right: 12px;
					border-width: 8px;
					border-style: solid;
					border-color: #1a1f2d transparent transparent transparent;
				}

				.metform-promo-banner-icon:hover .tooltip {
					visibility: visible;
					opacity: 1;
				}
			</style>
			<script type="text/javascript">
				var metform_promo_banner_admin_var = {
					adminurl: '<?php echo esc_url(admin_url()); ?>'
				};

				jQuery(document).ready(function($) {

					const MetformInstallBtn = document.querySelector('.metform-install-activate-btn');

					if (!MetformInstallBtn) {
						return;
					}

					const isAlreadyInstalled = "<?php echo esc_attr($this->is_already_installed) ?>";
					let installationUrl = "<?php echo esc_url($this->installation_url('metform/metform.php')) ?>";
					let activationUrl = "<?php echo esc_url($this->activation_url('metform/metform.php')) ?>";
					installationUrl = installationUrl?.replace(/&#038;/g, '&');
					activationUrl = activationUrl?.replace(/&#038;/g, '&');

					function metform_install_active_plugin(ajaxurl, success_callback, beforeText) {
						try {
							$.ajax({
								type: "GET",
								url: ajaxurl,
								beforeSend: () => {
									MetformInstallBtn.innerHTML = beforeText;
								},
								success: (response) => {
									if (success_callback) {
										success_callback();
									} else {
										window.location.href = window.metform_promo_banner_admin_var.adminurl + 'edit.php?post_type=metform-form&redirect_from=mf_promo_banner#show-metform-form-creation-modal';
									}
								},
								error: function(error) {
									console.error(error);
								}
							});
						} catch (error) {
							console.error("An error occurred:", error);
						}
					}

					MetformInstallBtn.addEventListener('click', function(e) {

						e.preventDefault();

						if (isAlreadyInstalled === '0') {
							metform_install_active_plugin.call(this, installationUrl, () => {
								metform_install_active_plugin.call(this, activationUrl, null, 'Activating...');
							}, 'Installing...');
						} else if (isAlreadyInstalled === '1') {
							metform_install_active_plugin.call(this, activationUrl, null, 'Activating...');
						}
					});
				});
			</script>
<?php
		}

		/**
		 * Get plugin installation url
		 * 
		 * @access public
		 * @param string
		 * @return string
		 */
		public function installation_url($pluginName)
		{
			$action     = 'install-plugin';
			$pluginSlug = $this->get_plugin_slug($pluginName);

			return wp_nonce_url(
				add_query_arg(
					array(
						'action' => $action,
						'plugin' => $pluginSlug
					),
					admin_url('update.php')
				),
				$action . '_' . $pluginSlug
			);
		}

		/**
		 * Get plugin slug
		 * 
		 * @access public
		 * @param string	
		 * @return string
		 */
		public function get_plugin_slug($name)
		{
			$split = explode('/', $name);

			return isset($split[0]) ? $split[0] : null;
		}

		/**
		 * Get plugin activation url
		 * 
		 * @access public
		 * @param string
		 * @return string
		 */
		public function activation_url($pluginName)
		{

			return wp_nonce_url(add_query_arg(
				array(
					'action'        => 'activate',
					'plugin'        => $pluginName,
					'plugin_status' => 'all',
					'paged'         => '1&s',
				),
				admin_url('plugins.php')
			), 'activate-plugin_' . $pluginName);
		}
	}
}
