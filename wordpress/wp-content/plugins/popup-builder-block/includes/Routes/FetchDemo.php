<?php

namespace PopupBuilderBlock\Routes;

defined( 'ABSPATH' ) || exit;

class FetchDemo extends Api {

	protected function get_routes(): array {
        return [
            [
                'endpoint'            => '/live-preview-template',
                'methods'             => 'GET',
                'callback'            => 'fetch_external_content',
			],
        ];
    }

	public function fetch_external_content( \WP_REST_Request $request ) {
		$url = $request->get_param( 'url' );

		if ( ! filter_var( $url, FILTER_VALIDATE_URL ) ) {
			return new \WP_REST_Response( array( 'error' => 'Invalid URL' ), 400 );
		}

		// Fetch the content using wp_remote_get
		$new_url  = add_query_arg( 'preview', 'true', $url );
		$response = wp_safe_remote_get( $new_url );
		if ( is_wp_error( $response ) ) {
			return new \WP_REST_Response( array( 'error' => 'Error fetching content' ), 500 );
		}
		// Return the fetched content
		$body = wp_remote_retrieve_body( $response );
		$body = preg_replace( '/type="[^"]+-text\/javascript"/', 'type="text/javascript"', $body );
		return new \WP_REST_Response( array( 'content' => $body ), 200 );
	}
}