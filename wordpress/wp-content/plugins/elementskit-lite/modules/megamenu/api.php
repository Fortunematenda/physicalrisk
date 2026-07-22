<?php
namespace ElementsKit_Lite;

use ElementsKit_Lite\Libs\Framework\Attr;
use ElementsKit_Lite\Modules\Megamenu\Init;

defined( 'ABSPATH' ) || exit;

class Megamenu_Api extends Core\Handler_Api {

	public function config() {
		$this->prefix = 'megamenu';
	}

	private function current_user_can_save_menuitem_settings() {
		return current_user_can( 'manage_options' ) && ( is_multisite() ? is_super_admin() : current_user_can( 'unfiltered_html' ) );
	}

	private function sanitize_icon_class( $icon_class ) {
		$classes = preg_split( '/\s+/', sanitize_text_field( wp_unslash( $icon_class ) ) );
		$classes = array_filter( array_map( 'sanitize_html_class', $classes ) );

		return implode( ' ', $classes );
	}

	private function sanitize_color( $color ) {
		$color = sanitize_text_field( wp_unslash( $color ) );

		return sanitize_hex_color( $color ) ? $color : '';
	}

	private function sanitize_menuitem_settings( $settings ) {
		$settings = is_array( $settings ) ? wp_unslash( $settings ) : array();

		return array(
			'menu_id'                         => isset( $settings['menu_id'] ) ? absint( $settings['menu_id'] ) : 0,
			'menu_has_child'                  => isset( $settings['menu_has_child'] ) ? sanitize_text_field( $settings['menu_has_child'] ) : '',
			'menu_enable'                     => empty( $settings['menu_enable'] ) ? 0 : 1,
			'menu_icon'                       => isset( $settings['menu_icon'] ) ? $this->sanitize_icon_class( $settings['menu_icon'] ) : '',
			'menu_icon_color'                 => isset( $settings['menu_icon_color'] ) ? $this->sanitize_color( $settings['menu_icon_color'] ) : '',
			'menu_badge_text'                 => isset( $settings['menu_badge_text'] ) ? sanitize_text_field( $settings['menu_badge_text'] ) : '',
			'menu_badge_color'                => isset( $settings['menu_badge_color'] ) ? $this->sanitize_color( $settings['menu_badge_color'] ) : '',
			'menu_badge_background'           => isset( $settings['menu_badge_background'] ) ? $this->sanitize_color( $settings['menu_badge_background'] ) : '',
			'mobile_submenu_content_type'     => isset( $settings['mobile_submenu_content_type'] ) ? sanitize_key( $settings['mobile_submenu_content_type'] ) : 'builder_content',
			'vertical_megamenu_position_type' => isset( $settings['vertical_megamenu_position_type'] ) ? sanitize_key( $settings['vertical_megamenu_position_type'] ) : 'relative_position',
			'vertical_menu_width'             => isset( $settings['vertical_menu_width'] ) ? sanitize_text_field( $settings['vertical_menu_width'] ) : '',
			'megamenu_width_type'             => isset( $settings['megamenu_width_type'] ) ? sanitize_key( $settings['megamenu_width_type'] ) : 'default_width',
			'megamenu_ajax_load'              => isset( $settings['megamenu_ajax_load'] ) && 'yes' === $settings['megamenu_ajax_load'] ? 'yes' : 'no',
		);
	}

	public function get_save_menuitem_settings() {
		if ( ! $this->current_user_can_save_menuitem_settings() ) {
			return;
		}
		$settings           = $this->sanitize_menuitem_settings( $this->request['settings'] );
		$menu_item_id       = $settings['menu_id'];
		$menu_item_settings = wp_json_encode( $settings, JSON_UNESCAPED_UNICODE );
		update_post_meta( $menu_item_id, Init::$menuitem_settings_key, $menu_item_settings );

		return array(
			'saved'   => 1,
			'message' => esc_html__( 'Saved', 'elementskit-lite' ),
		);
	}

	public function get_get_menuitem_settings() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$menu_item_id = $this->request['menu_id'];

		$data = get_post_meta( $menu_item_id, Init::$menuitem_settings_key, true );
		return (array) json_decode( $data );
	}

	public function get_megamenu_content() {
		$menu_item_id = intval($this->request['id']);

		if ('publish' !== get_post_status ($menu_item_id) || post_password_required($menu_item_id)) {
			return;
		}

		$output   = \ElementsKit_Lite\Utils::render_elementor_content($menu_item_id);

		return $output;
	}
}
new Megamenu_Api();
