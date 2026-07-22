<?php 

namespace EmailKit\Admin\Api;

use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit;

class UpdateData
{

	public $prefix = '';
	public $param = '';
	public $request = null;


	public function __construct()
	{

		add_action('rest_api_init', function () {
			register_rest_route('emailkit/v1/update-data', '(?P<post_id>\d+)', array(
				'methods'  => \WP_REST_Server::ALLMETHODS,
				'callback' => [$this, 'update_action'],
				'permission_callback' => '__return_true',
			));
		});
	}

	public function update_action($request)
	{

		if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
			return [
				'status'    => 'fail',
				'message'   => [ __('Nonce mismatch.', 'emailkit') ]
			];
		}


		if (!is_user_logged_in() || !current_user_can('manage_options')) {
			return [
				'status'    => 'fail',
				'message'   => [ __('Access denied.', 'emailkit') ]
			];
		}

		$body = $request->get_body();
		$req = json_decode($body);


		$post_id = (int) $request->get_param('post_id');
		if (!$post_id || !get_post($post_id) || get_post_type($post_id) !== 'emailkit') {
			return [
				'status'    => 'fail',
				'message'   => ['Invalid post ID.']
			];
		}

		$data = array(
			'ID' => $post_id,
			'meta_input'  => array(
				'emailkit_template_content_html'   => $req->html,
				'emailkit_template_content_object' => Utils::escape_quotes($req->object),
				'emailkit_template_status'         => trim($request->get_param('emailkit_template_status') ?? 'inactive'),
				'emailkit_email_subject'           => $request->get_param('emailkit_email_subject'),
				'emailkit_email_preheader'         => $request->get_param('emailkit_email_preheader'),

			),
		);

		$template_type = get_post_meta($post_id, 'emailkit_template_type', true);
		
		if('active' == trim($request->get_param('emailkit_template_status'))){

			$this->deactivateTemplateTypes($template_type);
		}

		$post_id = wp_update_post($data);

		if (is_wp_error($post_id)) {
			return [
				"status"  => "failed",
				"message" => [
					__( 'Post updated successfully.', 'emailkit' ),
				],
			];
		} else {
			return [

				"status"    => "success",
				"data"      => [
					"templateId" => $post_id,
				],
				"message"   => [
					__( 'Post updated successfully.', 'emailkit' ),
				],
			];
		}
	}

	public function deactivateTemplateTypes($type)
    {

        $query = array(
            'post_type' => 'emailkit',
            'meta_query' => array(
                array(
                    'key' => 'emailkit_template_type',
                    'value' => $type,
                    'compare' => '=',
                ),
                array(
                    'key' => 'emailkit_template_status',
                    'value' => 'active',
                    'compare' => '=',
                ),
                'relation' => 'AND',
                'fields' => 'ids'
            )
        );

        $data = new \WP_Query($query);
        if (isset($data)) {
            $postsIds = wp_list_pluck($data->posts, 'ID');
            foreach ($postsIds as $id) {
                update_post_meta($id, 'emailkit_template_status', 'inactive');
            }
        }
    }

}