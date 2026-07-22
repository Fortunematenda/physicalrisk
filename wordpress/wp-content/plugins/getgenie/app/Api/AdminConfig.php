<?php

namespace GenieAi\App\Api;

class AdminConfig
{

    public $prefix  = '';
    public $param   = '';
    public $request = null;

    /**
     * Constructor
     * 
     * Registers the REST API route for saving admin configuration.
     * 
     * @access public
     * @return void
     */
    public function __construct()
    {
        add_action('rest_api_init', function () {
            register_rest_route('getgenie/v1', 'admin-config', array(
                'methods'             => 'POST',
                'callback'            => [$this, 'save_admin_config'],
                'permission_callback' => '__return_true',
            ));
            register_rest_route('getgenie/v1', 'admin-config', array(
                'methods'             => 'GET',
                'callback'            => [$this, 'get_admin_config'],
                'permission_callback' => '__return_true',
            ));
        });
    }

    /**
     * Save admin configuration
     * 
     * Handles the request to save the admin configuration.
     * 
     * @access public
     * @param \WP_REST_Request $request The request object.
     * @return array The response data.
     */
    public function save_admin_config($request)
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

            $admin_config = get_option('getgenie_admin_dashboard_config', []);
            $request = json_decode($request->get_body(), true);
            $updated_admin_config = array_merge($admin_config, $request);

            update_option('getgenie_admin_dashboard_config', $updated_admin_config);

            return [
                'status'  => 'success',
                'message' => ['Admin config updated successfully.'],
                'data'    => $updated_admin_config,
            ];
        } catch (\Exception $e) {
            return [
                'status'  => 'fail',
                'message' => ['An error occurred: ' . $e->getMessage()],
            ];
        }
    }

    /**
     * Get admin configuration
     * 
     * Handles the request to get the admin configuration.
     * 
     * @access public
     * @param \WP_REST_Request $request The request object.
     * @return array The response data.
     */
    public function get_admin_config($request)
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

            $admin_config = get_option('getgenie_admin_dashboard_config', []);

            return [
                'status'  => 'success',
                'data'    => $admin_config,
            ];
        } catch (\Exception $e) {
            return [
                'status'  => 'fail',
                'message' => ['An error occurred: ' . $e->getMessage()],
            ];
        }
    }
}