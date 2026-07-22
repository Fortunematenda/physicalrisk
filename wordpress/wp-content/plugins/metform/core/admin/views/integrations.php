<?php

defined('ABSPATH') || exit;

include __DIR__ . "/icons.php";

$pro_exists = class_exists('\MetForm_Pro\Base\Package');

$aweber_btn_text = $code ? __('Re Connect Aweber', 'metform') : __('Connect Aweber', 'metform');
$aweber_connect_url = "https://api.wpmet.com/public/aweber-auth/auth.php?redirect_url=". get_admin_url() . "admin.php?page=metform-menu-settings&state=" . wp_create_nonce() . "&section_id=mf-newsletter_integration";

$news_letter_integrations = array(
	/**
	 * Integration Configuration Guide:
	 * 
	 * required_tier: 'free' | 'pro' | 'mid' | 'top'
	 *   - 'free': Available to all users
	 *   - 'pro': Requires any pro version
	 *   - 'mid': Requires Professional tier or higher
	 *   - 'top': Requires Agency tier only
	 * 
	 * existing_pro_user_access: true | false
	 *   - true: Existing pro users who already use this integration keep access (for features moved to higher tier)
	 *   - false: New features - only tier check, no legacy support needed
	 * 
	 * Note: Old pro users (before tier system) automatically get access to ALL pro features regardless of tier.
	 */
	'mailchimp' => array(
		'label' => __('MailChimp', 'metform'),
		'description' => __('Integrate MetForm with Mailchimp to establish seamless email marketing with automation.', 'metform'),
		'doc_url' => 'https://wpmet.com/doc/integration/',
		'icon' => $icons['mailchimp'],
		'button_text' => __('Save', 'metform'),
		'status' => 'pro',
		'required_tier' => 'pro',           // Requires pro
		'existing_pro_user_access' => true,  // Was free before, allow existing users who already use it
		'form_fields' => array(
			array(
				'name' => 'mf_mailchimp_api_key',
				'label' => __('API Key:', 'metform'),
				'placeholder' => __('Mailchimp API key', 'metform'),
				'help_text' => __('Enter here your Mailchimp API key.', 'metform'),
				'help_url' => 'https://admin.mailchimp.com/',
			),
		),
	),
	'aweber' => array(
		'label' => __('Aweber', 'metform'),
		'description' => __('Streamline your customer relationship with automated email marketing by linking AWeber with MetForm.', 'metform'),
		'doc_url' => 'https://wpmet.com/doc/aweber-integration/',
		'icon' => $icons['aweber'],
		'status' => 'pro',
		'required_tier' => 'mid',            // Requires Professional tier or higher
		'existing_pro_user_access' => true,  // Was pro before, allow existing pro users who use it
		'redirect_url' => 'https://www.aweber.com/',
		'button_text' => $aweber_btn_text,
		'button_url' => $aweber_connect_url,
	),
	'activecampaign' => array(
		'label' => __('ActiveCampaign', 'metform'),
		'description' => __('Connect MetForm with ActiveCampaign for powerful email automation and incredible customer experiences.', 'metform'),
		'doc_url' => 'https://wpmet.com/doc/activecampaign/',
		'icon' => $icons['activecampaign'],
		'button_text' => __('Save', 'metform'),
		'status' => 'pro',
		'required_tier' => 'top',            // Requires Agency tier only
		'existing_pro_user_access' => true,  // Was pro before, allow existing pro users who use it
		'form_fields' => array(
			array(
				'name' => 'mf_active_campaign_url',
				'label' => __('API URL:', 'metform'),
				'placeholder' => __('ActiveCampaign API URL', 'metform'),
				'help_text' => __('Enter here your ActiveCampaign API URL.', 'metform'),
				'help_url' => 'https://www.activecampaign.com/',
			),
			array(
				'name' => 'mf_active_campaign_api_key',
				'label' => __('API Key:', 'metform'),
				'placeholder' => __('ActiveCampaign API key', 'metform'),
				'help_text' => __('Enter here your ActiveCampaign API key.', 'metform'),
				'help_url' => 'https://www.activecampaign.com/',
			),
		),
	),
	'getresponse' => array(
		'label' => __('GetResponse', 'metform'),
		'description' => __('Capture leads and launch targeted email campaigns with MetForm and GetResponse integration.', 'metform'),
		'doc_url' => 'https://wpmet.com/doc/getresponse-integration/',
		'icon' => $icons['getresponse'],
		'button_text' => __('Save', 'metform'),
		'status' => 'pro',
		'required_tier' => 'mid',            // Requires Professional tier or higher
		'existing_pro_user_access' => true,  // Was pro before, allow existing pro users who use it
		'form_fields' => array(
			array(
				'name' => 'mf_get_reponse_api_key',
				'label' => __('API Key:', 'metform'),
				'placeholder' => __('GetResponse API key', 'metform'),
			),
		),
	),
	'convertkit' => array(
		'label' => __('ConvertKit', 'metform'),
		'description' => __('Reinforce MetForm with ConvertKit to simplify email marketing and boost audience growth.', 'metform'),
		'doc_url' => 'https://wpmet.com/doc/convertkit-integration/',
		'icon' => $icons['convertkit'],
		'button_text' => __('Save', 'metform'),
		'status' => 'pro',
		'required_tier' => 'mid',            // Requires Professional tier or higher
		'existing_pro_user_access' => true,  // Was pro before, allow existing pro users who use it
		'form_fields' => array(
			array(
				'name' => 'mf_ckit_api_key',
				'label' => __('API Key:', 'metform'),
				'placeholder' => __('ConvertKit API key', 'metform'),
				'help_text' => __('Enter here your ConvertKit API key.', 'metform'),
				'help_url' => 'https://app.convertkit.com/users/login',

			),
			array(
				'name' => 'mf_ckit_sec_key',
				'label' => __('Secret Key:', 'metform'),
				'placeholder' => __('ConvertKit API secret', 'metform'),
				'help_text' => __('Enter here your ConvertKit API secret.', 'metform'),
				'help_url' => 'https://app.convertkit.com/users/login',
			),
		),
	),
	'mailerlite' => array(
		'label' => __('MailerLite', 'metform'),
		'description' => __('Connect MetForm with MailerLite to create stunning email campaigns and grow your subscriber list.', 'metform'),
		'doc_url' => 'https://wpmet.com/doc/mailerlite-integration/',
		'icon' => $icons['mailerlite'],
		'button_text' => __('Save', 'metform'),
		'status' => 'pro',
		'required_tier' => 'mid',             // Requires Professional tier or higher
		'existing_pro_user_access' => false,  // New integration - no legacy support needed
		'form_fields' => array(
			array(
				'name' => 'mf_mailerlite_api_key',
				'label' => __('API Key:', 'metform'),
				'placeholder' => __('MailerLite API key', 'metform'),
				'help_text' => __('Enter here your MailerLite API key.', 'metform'),
				'help_url' => 'https://dashboard.mailerlite.com/integrations/api',
			),
		),
	),
);

?>

<?php $news_letter_integration_function = function ($settings) use ($news_letter_integrations, $pro_exists) {

	foreach ($news_letter_integrations as $integration_key => $integration) : 
		// Use the Util class method to check if access should be restricted
		$is_restricted = \MetForm\Utils\Util::should_restrict_integration_access($integration, $integration_key);
	?>
		<div class="mf-dashboard__settings-api">
			<div class="mf-dashboard__settings-api__header">
				<div class="mf-dashboard__settings-api__header-title">
					<div class="icon-wrapper">
						<span>
							<?php \MetForm\Utils\Util::metform_content_renderer($integration['icon']); ?>
						</span>
						<div class="mf-dashboard__settings-api__header-action-button <?php echo esc_attr( $is_restricted ? 'disable' : '' ); ?>">
							<button class="manage-btn mf-modal-<?php echo esc_attr($integration_key); ?>-integration">
								<span> <svg xmlns="http://www.w3.org/2000/svg" width="15" height="14" viewBox="0 0 15 14" fill="none">
										<path d="M7.63674 8.90702C8.68995 8.90702 9.54374 8.05323 9.54374 7.00002C9.54374 5.94681 8.68995 5.09302 7.63674 5.09302C6.58353 5.09302 5.72974 5.94681 5.72974 7.00002C5.72974 8.05323 6.58353 8.90702 7.63674 8.90702Z" stroke="#181A26" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"></path>
										<path d="M1.28003 7.55939V6.44061C1.28003 5.77952 1.82035 5.23285 2.4878 5.23285C3.63836 5.23285 4.10875 4.41919 3.53029 3.42119C3.19974 2.84909 3.3968 2.10536 3.97526 1.77482L5.07496 1.14551C5.57714 0.846741 6.22552 1.02473 6.52428 1.52691L6.59421 1.64768C7.16631 2.64568 8.1071 2.64568 8.68555 1.64768L8.75548 1.52691C9.05424 1.02473 9.70262 0.846741 10.2048 1.14551L11.3045 1.77482C11.883 2.10536 12.08 2.84909 11.7495 3.42119C11.171 4.41919 11.6414 5.23285 12.792 5.23285C13.4531 5.23285 13.9997 5.77316 13.9997 6.44061V7.55939C13.9997 8.22048 13.4594 8.76715 12.792 8.76715C11.6414 8.76715 11.171 9.58081 11.7495 10.5788C12.08 11.1573 11.883 11.8946 11.3045 12.2252L10.2048 12.8545C9.70262 13.1533 9.05424 12.9753 8.75548 12.4731L8.68555 12.3523C8.11345 11.3543 7.17267 11.3543 6.59421 12.3523L6.52428 12.4731C6.22552 12.9753 5.57714 13.1533 5.07496 12.8545L3.97526 12.2252C3.3968 11.8946 3.19974 11.1509 3.53029 10.5788C4.10875 9.58081 3.63836 8.76715 2.4878 8.76715C1.82035 8.76715 1.28003 8.22048 1.28003 7.55939Z" stroke="#181A26" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"></path>
									</svg> <?php echo esc_html__('Manage', 'metform'); ?></span>
							</button>
						</div>
					</div>
					<div class="mf-dashboard__settings-api__header-wrap">
						<h2 class="integration-label"><?php echo esc_html($integration['label']); ?></h2>
					</div>
				</div>
				<p class="mf-dashboard__settings-api__header-description"><?php echo esc_html($integration['description']); ?></p>
			</div>
			<div class="mf-dashboard__settings-api__footer">
				<div class="mf-dashboard__settings-api__footer-switch">
					<?php
					if ( $is_restricted ) {
						$required_tier = $integration['required_tier'] ?? 'pro';
						$tooltip_text = \MetForm\Utils\Util::get_upgrade_tooltip($required_tier);
					?>
						<div class="mf-entry-pro mf-svg-container mf-pro-badge-wrapper mf-tooltip-wrapper" data-tooltip="<?php echo esc_attr($tooltip_text); ?>">
							<div class="mf-svg-inner mf-upgrade-btn">
								<svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none"><path d="M10.225 6.025h-8.4a1.2 1.2 0 0 0-1.2 1.2v4.2a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-4.2a1.2 1.2 0 0 0-1.2-1.2m-7.2 0v-2.4a3 3 0 1 1 6 0v2.4" stroke="#E81454" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<div style="font-size: 14px;" class="mf-svg-text"><?php echo esc_html__('Upgrade', 'metform'); ?></div>
							</div>
                    	</div>
					<?php
					} else { ?>
						<a class="mf-dashboard__settings-api__footer-pro-btn" href="<?php echo esc_url($integration['doc_url']); ?>" target="_blank" rel="noopener noreferrer">
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="14" viewBox="0 0 12 14" fill="none">
								<path d="M3.5 10.125H8.5" stroke="#3970FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
								<path d="M3.5 7.625H6" stroke="#3970FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
								<path d="M11 12V5.125L6.625 0.75H2.25C1.55964 0.75 1 1.30964 1 2V12C1 12.6904 1.55964 13.25 2.25 13.25H9.75C10.4404 13.25 11 12.6904 11 12Z" stroke="#3970FF" stroke-width="1.5" stroke-linejoin="round" />
								<path d="M6.625 0.75V3.875C6.625 4.56536 7.18463 5.125 7.875 5.125H11" stroke="#3970FF" stroke-width="1.5" stroke-linejoin="round" />
							</svg>
							<?php echo esc_html__('Documentation', 'metform'); ?>
						</a>
					<?php } ?>
				</div>
			</div>
		</div>
		<!-- pro newsletter integration modal  -->
		<div class="attr-modal mf-api-modal mf-api-modal-animate" id="metform_<?php echo esc_attr($integration_key); ?>_modal" tabindex="-1" role="dialog" aria-labelledby="metform_<?php echo esc_attr($integration_key); ?>_modalLabel" style="display:none;">
			<form action="" method="post" id="<?php echo esc_attr($integration_key); ?>">
				<div class="attr-modal-dialog mf-api-modal-dialog" role="document">
					<div class="attr-modal-content">
						<div class="mf-api-modal-close-btn" data-dismiss="modal" aria-label="Close Modal">
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M13 1 1 13M1 1l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
						<div class="mf-dashboard__settings-api__content ">
							<div class="mf-dashboard__settings-api__content-header">
								<h2><?php
									/* translators: %s: integration name (e.g. MailChimp). */
									echo esc_html(sprintf(__('Add %s Integrations', 'metform'), $integration['label']));
								?></h2>
							</div>
							<div class="mf-dashboard__settings-api__lists-content">
								<div class="mf-dashboard__settings-api__content-input">
									<?php if (isset($integration['form_fields'])) {
										foreach ($integration['form_fields'] as $field_key => $field) { 
										?>
											<h4 class="field-key"><?php echo esc_html($field['label']); ?></h4>
											<input name="<?php echo esc_attr($field['name']); ?>" type="text" placeholder="<?php echo esc_attr($field['placeholder']); ?>" value="<?php echo esc_attr((isset($settings[$field['name']])) ? $settings[$field['name']] : ''); ?>">
											<?php if (isset($field['help_text']) && isset($field['help_url'])): ?>
												<p class="help-text"><?php echo esc_html($field['help_text']); ?> <a href="<?php echo esc_url($field['help_url']); ?>"><?php echo esc_html__('Get API', 'metform'); ?></a></p>
											<?php endif; ?>
										<?php } ?>
										<div class="mf-dashboard__settings-api__btn-group">
											<button type="button" data-dismiss="modal" class="components-button mf-settings-form-submit-btn save-btn"> <?php echo esc_html(! empty($integration['button_text']) ? $integration['button_text'] : __('Save', 'metform')); ?> </button>
											<button type="button" class="components-button cancel-btn" data-dismiss="modal"><?php echo esc_html__('Cancel', 'metform'); ?></button>
										</div>
									<?php } ?>
									<?php if (isset($integration['redirect_url'])):  ?>
										<label for="attr-input-label" class="mf-setting-label mf-setting-label attr-input-label"><?php echo esc_html__('Redirect url:', 'metform'); ?></label>
										<p class="description"><?php echo esc_html($integration['redirect_url']); ?></p>
										<a href="<?php echo esc_attr($integration['button_url']); ?>" target="_blank" type="button" class="components-button save-btn"><?php echo esc_html($integration['button_text']); ?></a>
									<?php endif; ?>
								</div>
							</div>
						</div>
					</div>
				</div>
			</form>
		</div>
		<!-- pro modal  -->
<?php endforeach;
} ?>