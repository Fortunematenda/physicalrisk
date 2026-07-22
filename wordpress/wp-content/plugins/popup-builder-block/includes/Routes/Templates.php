<?php

namespace PopupBuilderBlock\Routes;

use DateTime;

defined('ABSPATH') || exit;

class Templates extends Api
{
	private const API_BASE = 'https://wpmet.com/plugin/popupkit/wp-json/popupkit/essential/v1';

	protected function get_routes(): array
	{
		return [
			[
				'endpoint'            => '/templates',
				'methods'             => 'GET',
				'callback'            => 'get_templates',
			]
		];
	}

	public function get_templates($request)
	{
		$templates = $this->get_cached_templates();

		if (empty($templates)) {
			return array(
				'status'  => 'error',
				'message' => 'No templates found',
			);
		}

		return array(
			'status'  => 'success',
			'data'    => $templates,
			'message' => 'Templates fetched successfully',
		);
	}

	private function prepare_cache_folder()
	{
		$upload_dir = wp_upload_dir();
		$cache_dir = trailingslashit($upload_dir['basedir']) . 'popupkit/templates';

		if (!file_exists($cache_dir)) {
			wp_mkdir_p($cache_dir);
		}

		return $cache_dir;
	}

	private function fetch_and_cache_templates($cache_file)
	{
		// Fetch from remote API
		$response = wp_remote_get(self::API_BASE . '/template-lite');

		if (is_wp_error($response)) {
			return []; // or handle error
		}

		$body = wp_remote_retrieve_body($response);
		$data = json_decode($body, true);

		// Store in uploads folder
		if (! empty($data)) {
			file_put_contents($cache_file, wp_json_encode($data));
			update_option('popupkit_templates_updated', current_time( 'mysql', 1 ));
		}

		return $data;
	}

	private function get_cached_templates()
	{
		$cache_dir = $this->prepare_cache_folder();
		$cache_file = trailingslashit($cache_dir) . 'templates.json';

		// If cache file exists, serve from it
		if (file_exists($cache_file)) {
			$last_check_time = get_option( 'popupkit_templates_updated' );
			$response = wp_remote_get(self::API_BASE . '/template-update');
			$response = wp_remote_retrieve_body($response);
			$modified_time = new DateTime( trim( $response, '"' ) );

			if(!empty($modified_time) && $modified_time->format('Y-m-d H:i:s') > $last_check_time) {
				// If the template has been updated since last check, fetch new templates
				return $this->fetch_and_cache_templates($cache_file);
			}

			$data = file_get_contents($cache_file);
			$templates = json_decode($data, true);

			// Validate structure
			if (! empty($templates) && is_array($templates)) {
				return $templates;
			}
		}

		// If no files found, fetch from API and cache
		return $this->fetch_and_cache_templates($cache_file);
	}
}
