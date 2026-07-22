<?php 

namespace EmailKit\Admin\Api;

defined('ABSPATH') || exit;

use WP_Query;

class FetchData
{

    public $prefix = '';
    public $param = '';
    public $request = null;


    public function __construct()
    {
        add_action('rest_api_init', function () {
            register_rest_route('emailkit/v1', 'fetch-data', array(
                'methods'  => \WP_REST_Server::ALLMETHODS,
                'callback' => [$this, 'action'],
                'permission_callback' => '__return_true',
            ));
        });
    }

    public function action($request)
    {

        if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return [
                'status'    => 'fail',
                'message'   => [ __( 'Nonce mismatch.', 'emailkit' ) ]
            ];
        }

        if (!is_user_logged_in() || !current_user_can('manage_options')) {
            return [
                'status'    => 'fail',
                'message'   => [ __('Access denied.', 'emailkit') ]
            ];
        }

        $args = array(
            'id' => get_the_ID(),
            'post_type' => 'emailkit',
            'post_status'    => 'publish',
            'orderby'    => 'date',
            'order'    => 'DESC',
            'posts_per_page' => -1,

        );


        $loop = new \WP_Query($args);

        $email_data = [];

        while ($loop->have_posts()) : $loop->the_post();

            $email_data[] = [
                "id"                        => get_the_ID(),
                "date"                      => get_the_date('Y-m-d H:i:s'),
                "object"                    => get_post_meta(get_the_ID(), 'emailkit_template_content_object', true),
                "html"                      => get_post_meta(get_the_ID(), 'emailkit_template_content_html', true),
                'emailkit_template_type'    => get_post_meta(get_the_ID(),  'emailkit_template_type', true),
                'emailkit_template_status'  => get_post_meta(get_the_ID(),  'emailkit_template_status', true),
                "subject"                   => get_post_meta(get_the_ID(),  'emailkit_email_subject', true),
                "preheader"                 => get_post_meta(get_the_ID(),  'emailkit_email_preheader', true),
                'emailkit_template_initial_content_object' => get_post_meta(get_the_ID(),'emailkit_template_initial_content_object', true),

            ];

        endwhile;

        wp_reset_postdata();

        return [
            "status"    => "success",
            "data"      => [
                "history" => $email_data,
            ],
            "message"   => [
                __( "Email list has been fetched successfully.", 'emailkit' ),
            ],
        ];
    }
}