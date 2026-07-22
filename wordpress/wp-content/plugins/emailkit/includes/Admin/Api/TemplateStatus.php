<?php 

namespace EmailKit\Admin\Api;

defined('ABSPATH') || exit;

class TemplateStatus {

	public function __construct()
	{
		add_action('rest_api_init', function () {
			register_rest_route('emailkit/v1', 'template-status', array(
				'methods'  => 'POST',
				'callback' => [$this, 'changeStatus'],
				'permission_callback' => '__return_true',
			));
		});
	}

	public function changeStatus($request) {

		if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
			return [
				'status'    => 'fail',
				'message'   => [ __( 'Nonce mismatch.', 'emailkit' ) ]
			];
		}

		if (!is_user_logged_in() || !current_user_can('manage_options')) {
			return [
				'status'    => 'fail',
				'message'   => [ __( 'Permission denied.', 'emailkit' ) ]
			];
		}


		$post_id    = absint($request->get_param('templateId'));

		$old_status = sanitize_text_field(get_post_meta($post_id, 'emailkit_template_status', true));

		if ( empty($post_id) ) {
			return [
				'status'    => 'fail',
				'message'   => [ __( 'Invalid parameters.','emailkit' ) ]
			];
		}


		$new_status = $old_status == 'active' ? 'inactive' : 'active';
		$template_type = get_post_meta($post_id, 'emailkit_template_type', true);
		

		$data = array(
			'ID'          => $post_id,
			'post_type'   => 'emailkit',
			'post_status' => 'publish',
			'meta_input'  => array(
				'emailkit_template_status' => $new_status,
			)
		);


		if('active' == $new_status){

			$this->deactivateTemplateTypes($template_type);
		}
		// Update the post status in the database
		wp_update_post($data);
	

		return [
			'status'      => 'success',
			'message'     => [ __( 'Template status updated successfully.', 'emailkit' ) ],
			'status_text' => ucfirst($new_status),
			'template_type' => str_replace(' ', '-', strtolower($template_type))
		];
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