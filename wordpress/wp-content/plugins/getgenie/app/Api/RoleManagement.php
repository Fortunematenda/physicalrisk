<?php

namespace GenieAi\App\Api;

class RoleManagement
{

    public $prefix  = '';
    public $param   = '';
    public $request = null;

    /**
     * Constructor
     * 
     * Registers the REST API route for saving role management configuration.
     * 
     * @access public
     * @return void
     */
    public function __construct()
    {

        add_action('rest_api_init', function () {
            register_rest_route('getgenie/v1', 'role-management', array(
                'methods'             => 'POST',
                'callback'            => [$this, 'save_role_management_config'],
                'permission_callback' => '__return_true',
            ));

            register_rest_route('getgenie/v1', 'wp-roles', array(
                'methods'             => 'POST',
                'callback'            => [$this, 'get_wp_default_roles'],
                'permission_callback' => '__return_true',
            ));
        });
    }

    /**
     * Save role management configuration
     * 
     * Handles the request to save the role management configuration.
     * 
     * @access public
     * @param \WP_REST_Request $request The request object.
     * @return array The response data.
     */
    public function save_role_management_config($request)
    {
        try {
            if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
                return [
                    'status'  => 'fail',
                    'message' => ['Nonce mismatch.'],
                ];
            }

            if (!is_user_logged_in() || !current_user_can('manage_options')) {
                return [
                    'status'  => 'fail',
                    'message' => ['Access denied.'],
                ];
            }

            $config_data = $request->get_json_params();

            // Validate that required keys are present
            $required_keys = ['access_seo_insights', 'access_ai_writing', 'access_keyword_research'];
            foreach ($required_keys as $key) {
                if (!isset($config_data[$key])) {
                    return [
                        'status'  => 'fail',
                        'message' => ["Missing required key: {$key}"],
                    ];
                }
            }

            // Save to WordPress options table
            update_option('genie_role_management_config', $config_data);

            return [
                'status'  => 'success',
                'message' => ['Role management config updated successfully.'],
                'data'    => $config_data,
            ];
        } catch (\Exception $e) {
            return [
                'status'  => 'fail',
                'message' => ['An error occurred: ' . $e->getMessage()],
            ];
        }
    }

    /**
     * Get all default WordPress roles
     * 
     * Handles the request to get all default WordPress roles.
     * 
     * @access public
     * @param \WP_REST_Request $request The request object.
     * @return array The response data.
     */
    public function get_wp_default_roles($request)
    {
        try {
            if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
                return [
                    'status'  => 'fail',
                    'message' => ['Nonce mismatch.'],
                ];
            }

            if (!is_user_logged_in() || !current_user_can('manage_options')) {
                return [
                    'status'  => 'fail',
                    'message' => ['Access denied.'],
                ];
            }

            $wp_roles = \wp_roles()->get_names();
            $roles = [];

            foreach ($wp_roles as $role => $label) {
                // Only include roles that have 'publish_posts' capability
                $role_obj = \wp_roles()->get_role($role);
                if ($role_obj && !empty($role_obj->capabilities['publish_posts'])) {
                    $roles[] = [
                        'role'  => $role,
                        'label' => $label,
                    ];
                }
            }

            return [
                'status'  => 'success',
                'data'    => $roles,
            ];
        } catch (\Exception $e) {
            return [
                'status'  => 'fail',
                'message' => ['An error occurred: ' . $e->getMessage()],
            ];
        }
    }
}