<?php

namespace PopupBuilderBlock\Config;

defined( 'ABSPATH' ) || exit;

class SettingsList {

	public static function pbb_settings_list() {
		$list = array(
			'unfiltered_upload' => array(
				'_id'         => uniqid(),
				'slug'        => 'unfiltered_upload',
				'title'       => esc_html__('Unfiltered File Upload', 'popup-builder-block'),
				'description' => esc_html__('To be able to upload any SVG and JSON file from Media and PopupKit Icon Picker. PopupKit will remove any potentially harmful scripts and code by sanitizing the unfiltered files. We recommend enabling this feature only if you understand the security risks involved.', 'popup-builder-block'),
				'package'     => 'free',
				'status'      => 'inactive',
				'category'    => 'general',
			),
			'remote_image'      => array(
				'_id'         => uniqid(),
				'slug'        => 'remote_image',
				'title'       => esc_html__('Download Remote Image', 'popup-builder-block'),
				'description' => esc_html__('To download remote images from Popupkit Templates while importing a template, enable the "Download Remote Image" option.', 'popup-builder-block'),
				'package'     => 'free',
				'status'      => 'active',
				'category'    => 'general',
			),
			'uninstall-data'    => array(
				'_id'         => uniqid(),
				'slug'        => 'uninstall-data',
				'title'       => esc_html__('Remove All Data', 'popup-builder-block'),
				'description' => esc_html__('Enable this option to automatically delete all data related to the PopupKit when deleting this plugin.', 'popup-builder-block'),
				'package'     => 'free',
				'status'      => 'inactive',
				'category'    => 'data',
			),
			'analytics'         => array(
				'_id'         => uniqid(),
				'slug'        => 'analytics',
				'title'       => esc_html__('Data Storage Duration for Analytics', 'popup-builder-block'),
				'description' => esc_html__('Generally, PoupKit stores campaign data into the database. You can set a period for automatic deletion of old campaign data using the options below. (Note that deleted data will not appear on the Analytics page.)', 'popup-builder-block'),
				'package'     => 'free',
				'value'       => '2',
				'status'      => 'active',
				'category'    => 'advanced',
			),
			'user_consent'      => array(
				'_id'         => uniqid(),
				'slug'        => 'user_consent',
				'title'       => esc_html__('User Consent', 'popup-builder-block'),
				'description' => esc_html__('Show update & fix related important messages, essential tutorials and promotional images of PopupKit on WP Dashboard', 'popup-builder-block'),
				'package'     => 'free',
				'status'      => 'active',
				'category'    => 'general',
			),
		);

		return apply_filters('popup_builder_block/pbb-settings-tabs/list', $list );
	}
}
