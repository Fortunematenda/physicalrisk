<?php

namespace PopupBuilderBlock\Routes;

defined('ABSPATH') || exit;

use PopupBuilderBlock\Helpers\DataBase;

class ABTest extends Api {

	protected function get_routes(): array {
		return [
			[
				'endpoint'            => '/ab-tests',
				'methods'             => "GET",
				'callback'            => 'get_ab_tests',
                'args' => array(
                    'id' => array(
                        'required' => false,
                        'validate_callback' => function($param, $request, $key) {
                            return is_numeric($param);
                        },
                        'sanitize_callback' => 'absint'
                    )
                )
			],
		];
	}

    public function get_ab_tests( $request ) {
		$params = $request->get_params();
		$id = $params['id'] ?? '';
		if(!empty($id)) {
			$tests = DataBase::getDB( 'campaign_id', 'pbb_ab_test_variants', [ 'test_id = %d' => $id ], 0, false,  'id ASC');
			if ( empty( $tests ) ) {
				return array(
					'status'  => 'error',
					'message' => 'No AB test variant found with the provided ID',
				);
			}

			return array(
				'status'  => 'success',
				'data'    => $tests,
				'message' => 'AB test variant fetched successfully',
			);
		}

		// Fetch all AB tests from the database
		$tests = DataBase::getDB( '*', 'pbb_ab_tests', [], 0, false, 'id DESC' );

		if ( empty( $tests ) ) {
			return array(
				'status'  => 'error',
				'message' => 'No AB tests found',
			);
		}

		return array(
			'status'  => 'success',
			'data'    => $tests,
			'message' => 'AB tests fetched successfully',
		);
	}
}