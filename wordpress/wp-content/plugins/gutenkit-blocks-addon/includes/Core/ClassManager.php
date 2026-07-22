<?php
namespace Gutenkit\Core;

defined('ABSPATH') || exit;

/**
 * Class ClassManager
 */
class ClassManager {

    use \Gutenkit\Traits\Singleton;

    /**
     * Constructor.
     */
    public function __construct() {
        add_action('init', [$this, 'register_class_manager_post_type']);
        add_action('before_delete_post', [$this, 'delete_child_posts_with_parent']);

        // Admin UI Improvements
        add_filter('manage_class-manager_posts_columns', [$this, 'add_parent_column']);
        add_action('manage_class-manager_posts_custom_column', [$this, 'show_parent_column'], 10, 2);
        add_action('restrict_manage_posts', [$this, 'filter_by_parent_class']);
        add_filter('parse_query', [$this, 'apply_parent_class_filter']);

        // Sorting & Display Fixes
        add_filter('posts_clauses', [$this, 'modify_admin_post_order']);
        add_filter('the_title', [$this, 'indent_child_posts'], 10, 2);
    }

    /**
     * Registers the custom post type 'class-manager'.
     */
    public function register_class_manager_post_type() {
        $labels = array(
            'name'                  => _x( 'Classes', 'Post type general name', 'gutenkit-blocks-addon' ),
            'singular_name'         => _x( 'Class', 'Post type singular name', 'gutenkit-blocks-addon' ),
            'menu_name'             => _x( 'Class Manager', 'Admin Menu text', 'gutenkit-blocks-addon' ),
            'name_admin_bar'        => _x( 'Class', 'Add New on Toolbar', 'gutenkit-blocks-addon' ),
            'add_new'               => __( 'Add New Class', 'gutenkit-blocks-addon' ),
            'add_new_item'          => __( 'Add New Class', 'gutenkit-blocks-addon' ),
            'edit_item'             => __( 'Edit Class', 'gutenkit-blocks-addon' ),
            'view_item'             => __( 'View Class', 'gutenkit-blocks-addon' ),
            'all_items'             => __( 'All Classes', 'gutenkit-blocks-addon' ),
            'search_items'          => __( 'Search Classes', 'gutenkit-blocks-addon' ),
            'not_found'             => __( 'No classes found.', 'gutenkit-blocks-addon' ),
            'not_found_in_trash'    => __( 'No classes found in Trash.', 'gutenkit-blocks-addon' ),
        );

        $args = array(
            'labels'            => $labels,
            'public'            => false,    // Publicly queryable.
            'show_ui'           => false,    // Show in admin UI.
            'show_in_rest'      => true,    // Show in REST API.
            'supports'          => ['title', 'custom-fields', 'page-attributes'],   // Supports only title, custom fields, and parent/child hierarchy.
            'capability_type'   => 'post',  // Default post type
            'map_meta_cap'      => true,    // Map capabilities
            'hierarchical'      => true,    // Enable parent / child relationship
            'menu_icon'         => 'dashicons-media-code'   // Set the menu icon.
        );

        register_post_type('class-manager', $args);
    }

    /**
     * Sorts child posts under their parent in the admin list.
     */
    public function modify_admin_post_order($clauses) {
        global $typenow, $wpdb;
        
        if ($typenow === 'class-manager') {
            $clauses['join'] .= " LEFT JOIN $wpdb->posts AS parent ON $wpdb->posts.post_parent = parent.ID ";
            $clauses['orderby'] = "parent.post_title ASC, $wpdb->posts.post_title ASC";
        }

        return $clauses;
    }

	/**
	 * Indents child posts in the admin panel.
	 */
	public function indent_child_posts($title, $post_id) {
		$post = get_post($post_id);

		// Check if the post exists
		if (!$post) {
			return $title;
		}

		// Check if the post is of type 'class-manager'
		if( $post->post_type !== 'class-manager' ) {
			return $title; // Only apply to class-manager post type
		}

		return ($post->post_parent) ? '— ' . $title : $title;
	}

    /**
     * Adds a Parent Class column to the admin panel.
     */
    public function add_parent_column($columns) {
        $columns['parent_class'] = __('Parent Class', 'gutenkit-blocks-addon');

        $new_columns = array();

        // Insert 'parent_class' before 'date'
        foreach ($columns as $key => $value) {
            $new_columns[$key] = $value;
            if ($key === 'title') {  // Insert before 'date'
                $new_columns['parent_class'] = __('Parent Class', 'gutenkit-blocks-addon');
            }
        }
    
        return $new_columns;
    }
    
    /**
     * Displays the parent class in the custom column.
     */
    public function show_parent_column($column, $post_id) {
        if ($column === 'parent_class') {
            $parent_id = get_post_field('post_parent', $post_id);
            echo ($parent_id) ? '<a href="' . get_edit_post_link($parent_id) . '">' . get_the_title($parent_id) . '</a>' : __('None', 'gutenkit-blocks-addon');
        }
    }

    /**
     * Adds a dropdown filter for parent classes in the admin panel.
     */
    public function filter_by_parent_class() {
        global $typenow;
        
        if ($typenow === 'class-manager') {
            $parents = get_posts([
                'post_type'      => 'class-manager',
                'post_parent'    => 0,
                'posts_per_page' => -1
            ]);

            if ($parents) {
                echo '<select name="parent_post_filter">';
                echo '<option value="">' . __('All Parent Classes', 'gutenkit-blocks-addon') . '</option>';
                
                foreach ($parents as $parent) {
                    $selected = (isset($_GET['parent_post_filter']) && $_GET['parent_post_filter'] == $parent->ID) ? 'selected' : '';
                    echo '<option value="' . esc_attr($parent->ID) . '" ' . $selected . '>' . esc_html($parent->post_title) . '</option>';
                }

                echo '</select>';
            }
        }
    }

    /**
     * Modifies the query to filter by selected parent class.
     */
    public function apply_parent_class_filter($query) {
        global $pagenow, $typenow;
        
        if ($pagenow === 'edit.php' && $typenow === 'class-manager' && isset($_GET['parent_post_filter']) && $_GET['parent_post_filter'] != '') {
            $query->query_vars['post_parent'] = $_GET['parent_post_filter'];
        }
    }

    /**
     * Deletes child posts when a parent post is deleted.
     */
    public function delete_child_posts_with_parent($post_id) {
        $children = get_posts([
            'post_type'   => 'class-manager',
            'post_parent' => $post_id
        ]);

        foreach ($children as $child) {
            wp_delete_post($child->ID, true);
        }
    }
}