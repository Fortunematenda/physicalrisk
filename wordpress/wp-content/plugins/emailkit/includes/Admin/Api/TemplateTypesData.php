<?php 

namespace EmailKit\Admin\Api;

use EmailKit\Admin\TemplateList;
use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit;

class TemplateTypesData {

	public $prefix = '';
    public $param = '';
    public $request = null;

	public function __construct()
	{
        
		add_action('rest_api_init', function () {
            register_rest_route('emailkit/v1', 'template-types-data/(?P<template_type>\w+)', array(
                'methods'  => 'GET',
                'callback' => [$this, 'get_template_data'],
                'permission_callback' => '__return_true',
            ));
        });
	}

	public function get_template_data($request) {
 
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


        $template_type = $request->get_param('template_type');

        // Retrieve template list from TemplateList class
        $template_list = TemplateList::get_templates();
    
        // Find the templates matching the provided template type
        $matching_templates = [];
        foreach ($template_list as $template) {
            if ($template['title'] === $template_type) {
                $matching_templates[] = $template;
            }
        }
    
        if (empty($matching_templates)) {
            return [
                "status"    => "fail",
                "message"   => [
                    __( "No templates found for the provided template type.", 'emailkit' ),
                ],
            ];
        }
    
        $templates_data = [];
        foreach ($matching_templates as $matching_template) {
            // Check if the file path is empty and the package is 'pro'
            if (empty($matching_template['file']) && $matching_template['package'] === 'pro') {
                $template_data = array(
                    'date'               => get_the_date('Y-m-d H:i:s', $matching_template['id']),
                    'package'            => $matching_template['package'],
                    'mail_type'          => $matching_template['mail_type'],
                    'id'                 => $matching_template['id'],
                    'template_title'     => $matching_template['title'],
                    'object'             => '', // No template object since the file is empty
                    'template_thumbnail' => $matching_template['preview-thumb'], // Only include the thumbnail
                );
        
                $templates_data[] = $template_data;
                continue; // Skip further processing for this template
            }
        
            // Continue processing templates with a valid file path
            if (!empty($matching_template['file'])) {
                $json_content = file_get_contents($matching_template['file']);
                $json_content = Utils::normalize_template_asset_urls($json_content);
                $template_string = stripslashes($json_content);
                $template_object = json_decode($template_string, true);
        
                $template_data = array(
                    'date'               => get_the_date('Y-m-d H:i:s', $matching_template['id']),
                    'package'            => $matching_template['package'],
                    'mail_type'          => $matching_template['mail_type'],
                    'id'                 => $matching_template['id'],
                    'template_title'     => $matching_template['title'],
                    'object'             => $template_object,
                    'template_thumbnail' => $matching_template['preview-thumb'],
                );
        
                $templates_data[] = $template_data;
            }
        }
    
        return [
            "status"    => "success",
            "data"      => $templates_data,
            "message"   => [
                __( "Template files retrieved successfully.", 'emailkit' ),
            ],
        ];

    }

}