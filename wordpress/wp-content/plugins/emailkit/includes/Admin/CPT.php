<?php

namespace EmailKit\Admin;

defined( 'ABSPATH' ) || exit;

class CPT
{

    public function __construct()
    {
        add_action( 'init', [$this, 'postType'] );
        add_action( 'init', [$this, 'add_role'] );
        add_action( 'admin_menu', [$this, 'remove_add_new_submenu']);
        add_filter( 'wp_untrash_post_status', [$this, 'template_restore_to_published'], 10, 3 );
    }
    

    public function add_role(){
        $roles = array(get_role(('administrator')));
        
        foreach($roles as $role) {

            if($role) {
                $role->add_cap( 'edit_emailkit' ); 
                $role->add_cap( 'edit_others_emailkit' ); 
                $role->add_cap( 'publish_emailkit' ); 
                $role->add_cap( 'read_emailkit' ); 
                $role->add_cap( 'read_private_emailkit' ); 
                $role->add_cap( 'delete_emailkit' ); 
                $role->add_cap( 'edit_published_emailkit' );
                $role->add_cap( 'delete_published_' );
            }
        }
    }

    /**
     * Emailkit Template CPT
     */
    function postType()
    {
        $labels = array(

            'name'                  => esc_html_x('EmailKit', 'Post type general name', 'emailkit'),
            'singular_name'         => esc_html_x('EmailKit', 'Post type singular name', 'emailkit'),
            'menu_name'             => esc_html_x('EmailKit', 'Admin Menu text', 'emailkit'),
            'name_admin_bar'        => esc_html_x('EmailKit', 'Add New on Toolbar', 'emailkit'),
            'add_new'               => esc_html__('Add New Email', 'emailkit'),
            'add_new_item'          => esc_html__('Add New Email Template', 'emailkit'),
            'new_item'              => esc_html__('New Email', 'emailkit'),
            'edit_item'             => esc_html__('Edit Email Template', 'emailkit'),
            'view_item'             => esc_html__('View Email', 'emailkit'),
            'all_items'             => esc_html__('All Emails', 'emailkit'),
            'search_items'          => esc_html__('Search Emails', 'emailkit'),
            'parent_item_colon'     => esc_html__('Parent Emails:', 'emailkit'),
            'not_found'             => esc_html__('No email found.', 'emailkit'),
            'not_found_in_trash'    => esc_html__('No email found in Trash.', 'emailkit'),
            'archives'              => esc_html_x('Email archives', '', 'emailkit'),
            'insert_into_item'      => esc_html_x('Insert into email', '', 'emailkit'),
            'uploaded_to_this_item' => esc_html_x('Uploaded to this email', '', 'emailkit'),
            'filter_items_list'     => esc_html_x('Filter emails list', '', 'emailkit'),
            'items_list_navigation' => esc_html_x('Emails list navigation', '', 'emailkit'),
            'items_list'            => esc_html_x('Emails list', '', 'emailkit'),

        );

        $rewrite = [
			'slug'       => 'emailkit-template',
			'with_front' => true,
			'pages'      => false,
			'feeds'      => false,
		];

        $args = array(

            'label'               => esc_html__('Email Template', 'emailkit'),
            'description'         => esc_html__('Post Type Description', 'emailkit'),
            'labels'              => $labels,
            'supports'            => array('title'),
            'hierarchical'        => false,
            'public'              => true,
            'show_ui'             => true,
            'show_in_menu'        => 'emailkit-menu',
            'menu_icon'           => 'dashicons-email',
            'menu_position'       => 25,
            'show_in_admin_bar'   => true,
            'show_in_nav_menus'   => true,
            'can_export'          => true,
            'has_archive'         => true,
            'exclude_from_search' => false,
            'publicly_queryable'  => false,
            'rewrite'             => $rewrite,
            'capability_type'     => 'page',
            'capabilities'        => array(
                'publish_posts'      => 'publish_emailkit',
                'edit_posts'         => 'edit_emailkit',
                'delete_posts'       => 'delete_emailkit',
                'read_private_posts' => 'read_private_emailkit',
                'edit_post'          => 'edit_emailkit',
                'delete_post'        => 'delete_emailkit',
                'read_post'          => 'read_emailkit',
            ),
            // '_edit_link' => 'post.php?post=%d&builder=emailkit'

        );

        register_post_type('emailkit', $args);
    }

    function remove_add_new_submenu() {
        global $submenu;
        unset($submenu['edit.php?post_type=emailkit'][10]);
    }

    /**
     * Restore template to published mode by default it restore as draft status
     */
    function template_restore_to_published ( $new_status, $post_id, $previous_status ) {
    
        $post_type = get_post_type($post_id);
       
        if ( $post_type == 'emailkit-template' ) {
            return 'publish';
        }
    
        return $previous_status;
        
    }
}
