<?php

namespace PopupBuilderBlock\Hooks;

defined( 'ABSPATH' ) || exit;

use PopupBuilderBlock\Helpers\DataBase;

class Cpt {
	/**
	 * class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function __construct() {
		add_action( 'admin_init', array( $this, 'assign_capabilities' ) );
		add_action( 'init', array( $this, 'popup_builder_cpt' ) );
		add_filter( 'allowed_block_types_all', array( $this, 'allowed_blocks' ), 10, 2 );

		// Force block editor for our CPT even with Classic Editor active
		add_filter( 'use_block_editor_for_post_type', array( $this, 'force_block_editor_for_popup_cpt' ), 999, 2 );
	}

	/**
	 * Registers the 'popupkit-campaigns' custom post type for the PopupKit.
	 *
	 * @since 1.0.0
	 */
	public static function popup_builder_cpt() {
		$labels = array(
			'name'          => esc_html__( 'Campaigns', 'popup-builder-block' ),
			'singular_name' => esc_html__( 'Campaign', 'popup-builder-block' ),
			'all_items'     => esc_html__( 'Campaigns', 'popup-builder-block' ),
			'add_new'       => esc_html__( 'Create Blank', 'popup-builder-block' ),
			'add_new_item'  => esc_html__( 'Create Blank', 'popup-builder-block' ),
			'edit_item'     => esc_html__( 'Edit Campaign', 'popup-builder-block' ),
			'menu_name'     => esc_html__( 'Campaigns', 'popup-builder-block' ),
			'search_items'  => esc_html__( 'Search Campaign', 'popup-builder-block' ),
		);

		$args = array(
			'labels'              => $labels,
			'hierarchical'        => false,
			'description'         => esc_html__( 'organize and manage popup campaigns', 'popup-builder-block' ),
			'taxonomies'          => array(),
			'public'              => true,
			'show_ui'             => true,
			'show_in_menu'        => false,
			'show_in_admin_bar'   => true,
			'menu_position'       => 101,
			'menu_icon'           => 'dashicons-admin-page',
			'show_in_nav_menus'   => false,
			'publicly_queryable'  => true,
			'exclude_from_search' => true,
			'has_archive'         => false,
			'query_var'           => true,
			'can_export'          => true,
			'rewrite'             => true,
			'capability_type'     => 'post',
			'show_in_rest'        => true,
			'rest_namespace'      => 'pbb/v1',
			// TODO: details rnd on capabilities
			'capabilities'        => array(
				'publish_posts'      => 'publish_popup',
				'edit_posts'         => 'edit_popup',
				'delete_posts'       => 'delete_popup',
				'read_private_posts' => 'read_private_popup',
				'edit_post'          => 'edit_popup',
				'delete_post'        => 'delete_popup',
				'read_post'          => 'read_popup',
				'edit_page'          => 'edit_popup',
			),
			'template'            => array(
				array( 'popup-builder-block/popup-builder' ),
			),
			'template_lock'       => 'insert',
			'supports'            => array( 'title', 'editor' => array( 'notes' => true ), 'author', 'custom-fields', 'revisions' ),
		);

		register_post_type( 'popupkit-campaigns', $args );
	}

	/**
	 * Filters the allowed blocks in the block editor for the 'popupkit-campaigns' post type.
	 *
	 * @param array          $allowed_blocks   List of allowed block names.
	 * @param WP_Editor_Context $editor_context The current editor context.
	 * @return array Filtered list of allowed block names.
	 */
	public function allowed_blocks( $allowed_blocks, $editor_context ) {
		if ( empty( $editor_context->post ) ) {
			return $allowed_blocks;
		}

		if ( $editor_context->post->post_type !== 'popupkit-campaigns' ) {
			return $allowed_blocks;
		}

		// Ensure $allowed_blocks is an array
		if ( ! is_array( $allowed_blocks ) ) {
			$allowed_blocks = \WP_Block_Type_Registry::get_instance()->get_all_registered();
			$allowed_blocks = array_keys( $allowed_blocks ); // Convert to list of block names
		}

		$filtered = [];
		foreach ( $allowed_blocks as $block ) {
			if (
				strpos( $block, 'core/' ) === 0 ||
				strpos( $block, 'popup-builder-block/' ) === 0
			) {
				$filtered[] = $block;
			}
		}

		return $filtered;
	}

	/**
	 * Assigns popup capabilities to the administrator role.
	 *
	 * This function adds specific capabilities to the administrator role, allowing them to perform
	 * actions related to popups. The capabilities added include publishing, editing, deleting, and
	 * reading popups.
	 *
	 * @return void
	 */
	public function assign_capabilities() {
		$roles = array( 'administrator' );
		foreach ( $roles as $the_role ) {
			$role = get_role( $the_role );
			$role->add_cap( 'publish_popup' );
			$role->add_cap( 'edit_popup' );
			$role->add_cap( 'delete_popup' );
			$role->add_cap( 'read_private_popup' );
			$role->add_cap( 'edit_popup' );
			$role->add_cap( 'delete_popup' );
			$role->add_cap( 'read_popup' );
		}
	}

	/**
	 * Forces the block editor to be used for the popup campaign post type.
	 *
	 * This function ensures that the block editor (Gutenberg) is always used for the
	 * 'popupkit-campaigns' post type, even when the Classic Editor plugin is active.
	 *
	 * @param bool   $use_block_editor Whether to use the block editor.
	 * @param string $post_type        The post type being checked.
	 * @return bool True if this is our CPT, otherwise the original value.
	 */
	public function force_block_editor_for_popup_cpt( $use_block_editor, $post_type ) {
		if ( 'popupkit-campaigns' === $post_type ) {
			return true;
		}
		return $use_block_editor;
	}
}
