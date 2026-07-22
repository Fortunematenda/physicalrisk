<?php

namespace EmailKit\Admin\Api;

use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit;
class TemplateData
{

    public $prefix = '';
    public $param = '';
    public $request = null;

    public function __construct()
    {
        add_action('rest_api_init', function () {
            register_rest_route('emailkit/v1', 'template-data', array(
                'methods'  => \WP_REST_Server::ALLMETHODS,
                'callback' => [$this, 'action'],
                'permission_callback' => '__return_true',
            ));
        });
    }

    public function action($request)
    {
        
        if (!wp_verify_nonce($request->get_header( 'X-WP-Nonce' ), 'wp_rest')) {
            return [
                'status'    => 'fail',
                'message'   => ['Nonce mismatch.']
            ];
        }

        if (!is_user_logged_in() || !current_user_can( 'manage_options' )) {
            return [
                'status'    => 'fail',
                'message'   => ['Access denied.']
            ];
        }
        $template = '';
        $html = '';
        $body = $request->get_body();
        $req = json_decode($body);
        $message = '';
    

       
        if (!empty($request->get_param('emailkit-editor-template')) && trim($request->get_param('emailkit-editor-template')) !== '') {
            $template_path = $request->get_param('emailkit-editor-template');
            $allowed_base_path = wp_upload_dir()['basedir'] . '/emailkit/templates/';
            $real_path = realpath($template_path);
            if ($real_path === false || strpos($real_path, realpath($allowed_base_path)) !== 0) {
                return [
                    'status'    => 'fail',
                    'message'   => [__('Invalid template path', 'emailkit')]
                ];
            }

            $template = file_exists($real_path) ? file_get_contents($real_path) : '';
            $template = Utils::normalize_template_asset_urls($template);
            $html_path = str_replace("content.json", "content.html", $real_path);
            
            // Validate HTML path as well
            $real_html_path = realpath($html_path);
            if ($real_html_path !== false && strpos($real_html_path, realpath($allowed_base_path)) === 0) {
                
                $html = file_exists($real_html_path) ? file_get_contents($real_html_path) : '';
                $html = Utils::normalize_template_asset_urls($html);
            }
        }

        $subject = !empty($request->get_param( 'emailkit_template_title' ))? trim($request->get_param( 'emailkit_template_title' )) : null;

        $post_id = empty($req->postIdField) ? '' : $req->postIdField;
         $form_id = $request->get_param('form_id') ?? '';

        if (empty($post_id)) {
            $subject = ($request->get_param('emailkit_template_title') !== null) ? trim($request->get_param('emailkit_template_title')) : '';
            $data = array(
                'post_type'   => 'emailkit',
                'post_status' => 'publish',
                'post_author' => get_current_user_id(),
                'post_title' =>  $subject !== '' ?  $subject : "New Template ".uniqid(),
                'meta_input'  => array(
                    'emailkit_template_content_html'    => $html,
                    'emailkit_template_content_object'  => $template,
                    'emailkit_email_type'               => $request->get_param('emailkit_email_type'),
                    'emailkit_template_type'            => $request->get_param('emailkit_template_type'),
                    'emailkit_template_status'          => $request->get_param('emailkit_template_status') ?? 'inactive',
                    'emailkit_email_subject'            => $req->subject??'',
                    'emailkit_email_preheader'          => $req->preheader??'',
                    'emailkit_template_initial_content_object' => $template,
                    'emailkit_form_id' => $form_id,
                )
            );
            
            if(!empty($request->get_param('emailkit_template_status')) && trim($request->get_param('emailkit_template_status')) == 'active'){
                $this->deactivateTemplateTypes(get_post_meta($post_id,'emailkit_template_type', true));
            }
            $post_id = wp_insert_post($data);

            $message = __( 'Post created successfully.', 'emailkit' );
        }

        return [
            "status"    => "success",
            "data"      => [
                "templateId" => $post_id,
                'builder_url' => (admin_url("post.php?post={$post_id}&action=emailkit-builder")),
            ],
            "message"   => [
                $message,
            ],
        ];
    }
    public function deactivateTemplateTypes($type)
    {

        $query = array(
            'post_type' => 'emailkit',
            'relation' => 'AND',
            'meta_query' => array(
                array(
                    'key' => 'emailkit_template_type',
                    'value' => $type,
                    'compare' => '==',
                ),
                array(
                    'key' => 'emailkit_template_status',
                    'value' => 'active',
                    'compare' => '==',
                ),
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