<?php

namespace ElementsKit_Lite\Compatibility\Data_Migration;

defined('ABSPATH') || exit;

class Settings_Db
{
	public function __construct()
	{

		$widget_list = \ElementsKit_Lite\Config\Widget_List::instance()->get_list();
		$this->migrate($widget_list, 'widget');

		$module_list = \ElementsKit_Lite\Config\Module_List::instance()->get_list();
		$this->migrate($module_list, 'module');


		add_action('upgrader_process_complete', [$this, 'init'], 10, 2);
	}

	public function init($upgrader_object, $options)
	{
		$this->clear_cache($upgrader_object, $options);
		$this->ekit_mail_chimp_upgrader($upgrader_object, $options);

	}

	private function migrate($list, $type)
	{
		$list_db       = \ElementsKit_Lite\Libs\Framework\Attr::instance()->utils->get_option($type . '_list', array());
		$list_prepared = array();

		if (empty($list_db[0]) || is_array($list_db[0])) {
			return;
		}

		foreach ($list as $slug => $info) {
			if (isset($info['package']) && $info['package'] == 'pro-disabled') {
				continue;
			}

			if (isset($info['attributes']) && in_array('new', $info['attributes'])) {
				continue;
			}

			$info['status'] = (in_array($slug, $list_db) ? 'active' : 'inactive');

			$list_prepared[$slug] = $info;
		}

		\ElementsKit_Lite\Libs\Framework\Attr::instance()->utils->save_option($type . '_list', $list_prepared);
	}

	// TODO - remove this after 3.10.0 release
	public function clear_cache($upgrader_object, $options)
	{
		$our_plugin = 'elementskit-lite/elementskit-lite.php';
		if (!empty($options['plugins']) && $options['action'] == 'update' && $options['type'] == 'plugin') {
			foreach ($options['plugins'] as $plugin) {
				if ($plugin == $our_plugin) {
					$this->regenerate_widget_builder_widgets();
				}
			}
		}
	}

	public function regenerate_widget_builder_widgets()
	{
		$args = array(
			'post_type'      => 'elementskit_widget',
			'post_status'    => 'publish', // Only get published posts
			'posts_per_page' => -1,
		);

		$posts = get_posts($args);

		if ($posts) {
			foreach ($posts as $post) {
				$id = $post->ID;
				$widget_data = get_post_meta($id, 'elementskit_custom_widget_data', true);
				if (!empty($widget_data) && is_object($widget_data)) {
					\ElementsKit_Lite\Modules\Widget_Builder\Widget_File::instance()->create($widget_data, $id);
				}
			}
		}
	}

	public function ekit_mail_chimp_upgrader($upgrader_object, array $options)
	{
		// Stop if migration already ran
		if (get_transient('ekit_lite_mailchimp_migrate')) {
			return;
		}

		// Plugins to check for updates
		$plugins_to_check = [
			'elementskit-lite/elementskit-lite.php',
		];

		// Check if any of the specified plugins are updated
		if (!empty($options['action']) && $options['action'] === 'update') {

			$updated_plugins = [];

			if (!empty($options['plugins']) && is_array($options['plugins'])) {
				$updated_plugins = $options['plugins'];
			}

			if (!empty($options['plugin']) && !is_array($options['plugin'])) {
				$updated_plugins[] = $options['plugin'];
			}

			foreach ($plugins_to_check as $plugin_slug) {

				if (in_array($plugin_slug, $updated_plugins, true)) {

					// Store migration state
					set_transient(
						'ekit_lite_mailchimp_migrate',
						\ElementsKit_Lite::version()
					);

					$this->ekit_mail_chimp_migrate();
				}
			}
		}
	}
	public function ekit_mail_chimp_migrate()
	{
		global $wpdb;
		$post_ids = $wpdb->get_col('SELECT `post_id` FROM `' . $wpdb->postmeta . '` WHERE `meta_key` = "_elementor_data" AND `meta_value` LIKE \'%"widgetType":"elementskit-mail-chimp"%\';');

		foreach ($post_ids as $post_id) {
			// if($post_id != get_the_ID()){
			// 	continue;
			// }
			$do_update = false;
			$document  = \Elementor\Plugin::$instance->documents->get($post_id);

			if ($document) {
				$data = $document->get_elements_data();
			}
			$data = \Elementor\Plugin::$instance->db->iterate_data($data, function ($element) use (&$do_update) {

				if (empty($element['widgetType']) || 'elementskit-mail-chimp' !== $element['widgetType'] || !empty($element['settings']['ekit_mail_chimp_fields_repeater'])) {
					return $element;
				}

				$is_name_field = !empty($element['settings']['ekit_mail_chimp_section_form_name_show']) && $element['settings']['ekit_mail_chimp_section_form_name_show'] == 'yes';
				$is_phone_field = !empty($element['settings']['ekit_mail_chimp_section_form_phone_show']) && $element['settings']['ekit_mail_chimp_section_form_phone_show'] == 'yes';

				$repeater_fields = [];

				if ($is_name_field) {
					$repeater_fields[] = [
						'_id' => wp_unique_id(),
						'ekit_mail_chimp_field_type' => 'text',
						'ekit_mail_chimp_field_label' => $element['settings']['ekit_mail_chimp_first_name_label'] ?? '',
						'ekit_mail_chimp_field_placeholder' => $element['settings']['ekit_mail_chimp_first_name_placeholder'] ?? '',
						'ekit_mail_chimp_field_name' => 'firstname',
						'ekit_mail_chimp_field_required' => 'yes',
						'ekit_mail_chimp_field_icon_show' => $element['settings']['ekit_mail_chimp_first_name_icon_show'] ?? 'yes',
						'ekit_mail_chimp_field_icon' => $element['settings']['ekit_mail_chimp_first_name_icons'] ?? [
							'value' => 'icon icon-user',
							'library' => 'ekiticons',
						],
						'ekit_mail_chimp_field_icon_position' => $element['settings']['ekit_mail_chimp_first_name_icon_before_after'] ?? 'before',
					];
				}
				if ($is_name_field) {
					$repeater_fields[] = [
						'_id' => wp_unique_id(),
						'ekit_mail_chimp_field_type' => 'text',
						'ekit_mail_chimp_field_label' => $element['settings']['ekit_mail_chimp_last_name_label'] ?? '',
						'ekit_mail_chimp_field_placeholder' => $element['settings']['ekit_mail_chimp_last_name_placeholder'] ?? '',
						'ekit_mail_chimp_field_name' => 'lastname',
						'ekit_mail_chimp_field_required' => 'yes',
						'ekit_mail_chimp_field_icon_show' => $element['settings']['ekit_mail_chimp_last_name_icon_show'] ?? 'yes',
						'ekit_mail_chimp_field_icon' => $element['settings']['ekit_mail_chimp_last_name_icons'] ?? [
							'value' => 'icon icon-user',
							'library' => 'ekiticons',
						],
						'ekit_mail_chimp_field_icon_position' => $element['settings']['ekit_mail_chimp_last_name_icon_before_after'] ?? 'before',
					];
				}
				// Add Phone if enabled
				if ($is_phone_field) {
					$repeater_fields[] = [
						'_id' => wp_unique_id(),
						'ekit_mail_chimp_field_type' => 'tel',
						'ekit_mail_chimp_field_label' => $element['settings']['ekit_mail_chimp_phone_label'] ?? '',
						'ekit_mail_chimp_field_placeholder' => $element['settings']['ekit_mail_chimp_phone_placeholder'] ?? '',
						'ekit_mail_chimp_field_name' => 'phone',
						'ekit_mail_chimp_field_required' => 'yes',
						'ekit_mail_chimp_field_icon_show' => $element['settings']['ekit_mail_chimp_phone_icon_show'] ?? 'yes',
						'ekit_mail_chimp_field_icon' => $element['settings']['ekit_mail_chimp_phone_icons'] ?? [
							'value' => 'icon icon-phone-handset',
							'library' => 'ekiticons',
						],
						'ekit_mail_chimp_field_icon_position' => $element['settings']['ekit_mail_chimp_phone_icon_before_after'] ?? 'before',
					];
				}

				// ✅ ALWAYS add Email field (required)
				$repeater_fields[] = [
					'_id' => wp_unique_id(),
					'ekit_mail_chimp_field_type' => 'email',
					'ekit_mail_chimp_field_label' => $element['settings']['ekit_mail_chimp_email_address_label'] ?? '',
					'ekit_mail_chimp_field_placeholder' => $element['settings']['ekit_mail_chimp_email_address_placeholder'] ?? '',
					'ekit_mail_chimp_field_name' => 'email',
					'ekit_mail_chimp_field_required' => 'yes',
					'ekit_mail_chimp_field_icon_show' => $element['settings']['ekit_mail_chimp_email_icon_show'] ?? 'yes',
					'ekit_mail_chimp_field_icon' => $element['settings']['ekit_mail_chimp_email_icons'] ?? [
						'value' => 'icon icon-envelope',
						'library' => 'ekiticons',
					],
					'ekit_mail_chimp_field_icon_position' => $element['settings']['ekit_mail_chimp_email_icon_before_after'] ?? 'before',
				];


				// Update element with migrated data
				if (!empty($repeater_fields)) {
					$element['settings']['ekit_mail_chimp_fields_repeater'] = $repeater_fields;
					$do_update = true;
				}

				return $element;
			});
			if (!$do_update) {
				continue;
			}


			// We need the `wp_slash` in order to avoid the unslashing during the `update_post_meta`
			$json_value = wp_slash(wp_json_encode($data));

			update_metadata('post', $post_id, '_elementor_data', $json_value);

			// Clear WP cache for next step.
			wp_cache_flush();

		}
	}
}
