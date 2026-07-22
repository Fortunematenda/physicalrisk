<?php
/**
 * Agent turn endpoint for Proton (Engine B).
 *
 * Exposes a single, STATELESS model turn at /protuno/v1/agent/turn that
 * wraps WordPress 7.0's AI Client. The agent LOOP (prompt -> tool call ->
 * run tool in the browser -> feed result back -> repeat) lives in the Node
 * sidecar; this endpoint only performs one provider round-trip per call so
 * the API key stays server-side (configured via Settings -> Connectors).
 *
 * @link       https://posimyth.com/
 * @since      1.0.0
 *
 * @package    Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use WordPress\AiClient\Providers\Http\DTO\RequestOptions;

if ( ! class_exists( 'Protuno_Agent_Endpoint' ) ) {

	/**
	 * Stateless AI-turn REST endpoint backing the sidecar's Engine B agent.
	 *
	 * Registers POST /protuno/v1/agent/turn. Auth is delegated to the
	 * central Protuno_Rest_Permissions class (WP cookies/nonce or
	 * Application Password).
	 */
	class Protuno_Agent_Endpoint {

		const REST_NAMESPACE    = 'protuno/v1';
		const REST_ROUTE_TURN   = '/agent/turn';
		const REST_ROUTE_MODELS = '/agent/models';

		/** HTTP timeout (seconds) when uichemy_agent_request_timeout filter returns 0 (unlimited). */
		const UNLIMITED_HTTP_TIMEOUT = 86400;

		/**
		 * Hook route registration.
		 */
		public static function init() {
			add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		}

		/**
		 * Register the POST route.
		 */
		public static function register_routes() {
			register_rest_route(
				self::REST_NAMESPACE,
				self::REST_ROUTE_TURN,
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				self::REST_ROUTE_MODELS,
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_models' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);
		}

		/**
		 * Resolve HTTP timeout for provider API calls.
		 *
		 * Filter `uichemy_agent_request_timeout`: 0 (default) = no practical limit.
		 * WordPress HTTP still needs a numeric timeout, so 0 maps to 24 hours.
		 *
		 * @return float Timeout in seconds.
		 */
		private static function resolve_http_timeout(): float {
			$timeout = (float) apply_filters( 'uichemy_agent_request_timeout', 0 );

			if ( $timeout <= 0 ) {
				return (float) self::UNLIMITED_HTTP_TIMEOUT;
			}

			return $timeout;
		}

		/**
		 * Allow logged-in administrators authenticated via REST nonce or
		 * Application Password. Delegated to the central
		 * Protuno_Rest_Permissions class for consistency across every
		 * Protuno REST route.
		 *
		 * @param WP_REST_Request $request Incoming request.
		 * @return bool|\WP_Error
		 */
		public static function check_permission( WP_REST_Request $request ) {
			return Protuno_Rest_Permissions::check_admin( $request );
		}

		/**
		 * Run one AI model turn and return assistant text + any tool calls.
		 *
		 * @param WP_REST_Request $request Incoming request.
		 * @return WP_REST_Response
		 */
		public static function handle_post( WP_REST_Request $request ) {
			header( 'Access-Control-Allow-Origin: *' );

			$http_timeout = self::resolve_http_timeout();

			if ( function_exists( 'set_time_limit' ) ) {
				// 0 = no PHP execution time cap for this REST request.
				@set_time_limit( 0 );
			}

			if ( ! function_exists( 'wp_ai_client_prompt' ) ) {
				return self::error_response(
					501,
					'ai_client_unavailable',
					'WordPress AI Client not available. WordPress 7.0+ is required for the WordPress AI provider.'
				);
			}

			if ( ! wp_supports_ai() ) {
				return self::error_response(
					503,
					'ai_not_supported',
					'AI features are not supported in this environment. Configure a provider under Settings -> Connectors.'
				);
			}

			$body = $request->get_json_params();

			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error_response( 400, 'bad_request', 'Missing or invalid JSON body.' );
			}

			$messages_in = isset( $body['messages'] ) && is_array( $body['messages'] ) ? $body['messages'] : array();
			if ( empty( $messages_in ) ) {
				return self::error_response( 400, 'bad_request', 'A non-empty "messages" array is required.' );
			}

			// Build the conversation. DTO constructors throw on invalid
			// role/part combinations (a user message may not carry a function
			// call; a model message may not carry a function response) — turn
			// that into a clean 400 instead of a PHP fatal.
			try {
				$messages = self::build_messages( $messages_in );
			} catch ( Exception $e ) {
				return self::error_response( 400, 'invalid_messages', $e->getMessage() );
			}

			$builder = wp_ai_client_prompt( $messages );

			$system = isset( $body['system'] ) ? (string) $body['system'] : '';
			if ( '' !== $system ) {
				$builder->using_system_instruction( $system );
			}

			if ( isset( $body['tools'] ) && is_array( $body['tools'] ) && ! empty( $body['tools'] ) ) {
				try {
					$declarations = self::build_function_declarations( $body['tools'] );
				} catch ( Exception $e ) {
					return self::error_response( 400, 'invalid_tools', $e->getMessage() );
				}
				if ( ! empty( $declarations ) ) {
					$builder->using_function_declarations( ...$declarations );
				}
			}

			$model = isset( $body['model'] ) ? (string) $body['model'] : '';
			if ( '' !== $model ) {
				self::apply_model_preference( $builder, $model );
			}

			if ( isset( $body['max_tokens'] ) && is_numeric( $body['max_tokens'] ) ) {
				$builder->using_max_tokens( (int) $body['max_tokens'] );
			}

			// Override core's 30s default — Protuno agent turns may run as long as the provider needs.
			$builder->using_request_options(
				RequestOptions::fromArray(
					array(
						RequestOptions::KEY_TIMEOUT => $http_timeout,
					)
				)
			);

			$result = $builder->generate_text_result();

			if ( is_wp_error( $result ) ) {
				$data   = $result->get_error_data();
				$status = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
				return self::error_response( $status, $result->get_error_code(), $result->get_error_message() );
			}

			return self::success_response( $result );
		}

		/**
		 * List configured WordPress AI connectors and their text-generation models.
		 *
		 * @param WP_REST_Request $request Incoming request.
		 * @return WP_REST_Response
		 */
		public static function handle_get_models( WP_REST_Request $request ) {
			header( 'Access-Control-Allow-Origin: *' );

			if ( ! function_exists( 'wp_ai_client_prompt' ) ) {
				return new WP_REST_Response(
					array(
						'success'      => false,
						'aiSupported'  => false,
						'providers'    => array(),
						'models'       => array(),
						'configured'   => false,
					),
					200
				);
			}

			$ai_supported = function_exists( 'wp_supports_ai' ) && wp_supports_ai();
			$providers    = $ai_supported ? self::fetch_text_generation_providers() : array();
			$flat_models  = array();

			foreach ( $providers as $provider ) {
				foreach ( $provider['models'] as $model ) {
					$flat_models[] = $provider['id'] . '/' . $model['id'];
				}
			}

			$configured = false;
			if ( function_exists( 'wp_get_connectors' ) ) {
				foreach ( (array) wp_get_connectors() as $connector_id => $connector_data ) {
					if ( ! is_array( $connector_data ) || ( $connector_data['type'] ?? '' ) !== 'ai_provider' ) {
						continue;
					}
					try {
						$registry = \WordPress\AiClient\AiClient::defaultRegistry();
						if ( $registry->hasProvider( $connector_id ) && $registry->isProviderConfigured( $connector_id ) ) {
							$configured = true;
							break;
						}
					} catch ( Exception $e ) {
						continue;
					}
				}
			}

			return new WP_REST_Response(
				array(
					'success'     => true,
					'aiSupported' => $ai_supported,
					'configured'  => $configured,
					'providers'   => $providers,
					'models'      => $flat_models,
				),
				200
			);
		}

		/**
		 * Apply a model preference string to the prompt builder.
		 *
		 * Accepts "provider/model-id" (preferred) or a bare model id.
		 *
		 * @param WP_AI_Client_Prompt_Builder $builder Prompt builder.
		 * @param string                      $model   Model preference from the client.
		 */
		private static function apply_model_preference( $builder, string $model ): void {
			if ( str_contains( $model, '/' ) ) {
				$parts = explode( '/', $model, 2 );
				if ( count( $parts ) === 2 && '' !== $parts[0] && '' !== $parts[1] ) {
					$builder->using_model_preference( array( $parts[0], $parts[1] ) );
					return;
				}
			}

			$builder->using_model_preference( $model );
		}

		/**
		 * Fetch active AI providers and text-generation models from WordPress Connectors.
		 *
		 * @return list<array{id: string, name: string, models: list<array{id: string, name: string}>}>
		 */
		private static function fetch_text_generation_providers(): array {
			if ( ! class_exists( '\WordPress\AiClient\AiClient' ) ) {
				return array();
			}

			$registry     = \WordPress\AiClient\AiClient::defaultRegistry();
			$connectors   = function_exists( 'wp_get_connectors' ) ? (array) wp_get_connectors() : array();
			$requirements = new \WordPress\AiClient\Providers\Models\DTO\ModelRequirements(
				array( \WordPress\AiClient\Providers\Models\Enums\CapabilityEnum::textGeneration() ),
				array()
			);
			$providers    = array();

			foreach ( $connectors as $connector_id => $connector_data ) {
				if ( ! is_string( $connector_id ) || ! is_array( $connector_data ) ) {
					continue;
				}
				if ( ( $connector_data['type'] ?? '' ) !== 'ai_provider' ) {
					continue;
				}

				if ( ! empty( $connector_data['plugin']['is_active'] ) && is_callable( $connector_data['plugin']['is_active'] ) ) {
					if ( ! (bool) call_user_func( $connector_data['plugin']['is_active'] ) ) {
						continue;
					}
				}

				try {
					if ( ! $registry->hasProvider( $connector_id ) || ! $registry->isProviderConfigured( $connector_id ) ) {
						continue;
					}

					$models_metadata = $registry->findProviderModelsMetadataForSupport( $connector_id, $requirements );
					if ( empty( $models_metadata ) ) {
						continue;
					}

					$provider_class = $registry->getProviderClassName( $connector_id );
					$provider_name  = $connector_data['name'] ?? $connector_id;
					if ( is_string( $provider_class ) && class_exists( $provider_class ) ) {
						$provider_name = $provider_class::metadata()->getName();
					}

					$model_items = array();
					foreach ( $models_metadata as $model_meta ) {
						$model_items[] = array(
							'id'   => $model_meta->getId(),
							'name' => $model_meta->getName(),
						);
					}

					$providers[] = array(
						'id'     => $connector_id,
						'name'   => $provider_name,
						'models' => $model_items,
					);
				} catch ( Exception $e ) {
					continue;
				}
			}

			return $providers;
		}

		/**
		 * Convert the request's message array into AI Client Message DTOs.
		 *
		 * @param array $messages_in Raw messages from the request body.
		 * @return array<\WordPress\AiClient\Messages\DTO\Message>
		 *
		 * @throws InvalidArgumentException When a role/part combination is invalid.
		 */
		private static function build_messages( array $messages_in ) {
			$messages = array();

			foreach ( $messages_in as $msg ) {
				if ( ! is_array( $msg ) ) {
					continue;
				}

				$role_raw = isset( $msg['role'] ) ? (string) $msg['role'] : 'user';
				$role     = ( 'model' === $role_raw || 'assistant' === $role_raw )
					? \WordPress\AiClient\Messages\Enums\MessageRoleEnum::model()
					: \WordPress\AiClient\Messages\Enums\MessageRoleEnum::user();

				$parts_in = isset( $msg['parts'] ) && is_array( $msg['parts'] ) ? $msg['parts'] : array();
				$parts    = array();

				foreach ( $parts_in as $part ) {
					if ( ! is_array( $part ) ) {
						continue;
					}

					$type = isset( $part['type'] ) ? (string) $part['type'] : 'text';

					if ( 'function_call' === $type ) {
						$parts[] = new \WordPress\AiClient\Messages\DTO\MessagePart(
							new \WordPress\AiClient\Tools\DTO\FunctionCall(
								isset( $part['id'] ) ? (string) $part['id'] : null,
								isset( $part['name'] ) ? (string) $part['name'] : null,
								isset( $part['args'] ) ? $part['args'] : null
							)
						);
					} elseif ( 'function_response' === $type ) {
						$parts[] = new \WordPress\AiClient\Messages\DTO\MessagePart(
							new \WordPress\AiClient\Tools\DTO\FunctionResponse(
								isset( $part['id'] ) ? (string) $part['id'] : null,
								isset( $part['name'] ) ? (string) $part['name'] : null,
								isset( $part['response'] ) ? $part['response'] : null
							)
						);
					} elseif ( 'file' === $type && ! empty( $part['relPath'] ) ) {
						// Inline image uploaded via the chat upload endpoint.
						// Resolve the relative path to an absolute disk path and
						// pass it to the WP AI Client as an inline file (base64).
						$rel_path  = (string) $part['relPath'];
						$mime_type = isset( $part['mimeType'] ) ? (string) $part['mimeType'] : '';
						if ( class_exists( 'Protuno_Chat_Uploads' ) ) {
							$full_path = \Protuno_Chat_Uploads::resolve_path( $rel_path );
						} else {
							$full_path = '';
						}
						if ( '' !== $full_path && '' !== $mime_type ) {
							try {
								$parts[] = new \WordPress\AiClient\Messages\DTO\MessagePart(
									new \WordPress\AiClient\Files\DTO\File( $full_path, $mime_type )
								);
							} catch ( Exception $e ) {
								// File unreadable or unsupported — skip silently.
							}
						}
					} else {
						$parts[] = new \WordPress\AiClient\Messages\DTO\MessagePart(
							isset( $part['text'] ) ? (string) $part['text'] : ''
						);
					}
				}

				if ( empty( $parts ) ) {
					continue;
				}

				$messages[] = new \WordPress\AiClient\Messages\DTO\Message( $role, $parts );
			}

			if ( empty( $messages ) ) {
				throw new InvalidArgumentException( 'No usable messages after parsing.' );
			}

			return $messages;
		}

		/**
		 * Convert the request's tools array into FunctionDeclaration DTOs.
		 *
		 * @param array $tools_in Raw tools from the request body.
		 * @return array<\WordPress\AiClient\Tools\DTO\FunctionDeclaration>
		 *
		 * @throws InvalidArgumentException When a tool is missing a name.
		 */
		private static function build_function_declarations( array $tools_in ) {
			$declarations = array();

			foreach ( $tools_in as $tool ) {
				if ( ! is_array( $tool ) || empty( $tool['name'] ) ) {
					throw new InvalidArgumentException( 'Each tool requires a non-empty "name".' );
				}

				$parameters = ( isset( $tool['parameters'] ) && is_array( $tool['parameters'] ) && ! empty( $tool['parameters'] ) )
					? self::normalize_schema( $tool['parameters'] )
					: null;

				$declarations[] = new \WordPress\AiClient\Tools\DTO\FunctionDeclaration(
					(string) $tool['name'],
					isset( $tool['description'] ) ? (string) $tool['description'] : '',
					$parameters
				);
			}

			return $declarations;
		}

		/**
		 * Make a JSON Schema safe for the provider after PHP array encoding.
		 *
		 * WordPress decodes the request body to associative arrays, so an empty
		 * JSON object ({}) arrives as an empty PHP array and would re-encode as
		 * [] — which providers reject for "properties" (must be an object).
		 * Recurse the schema and cast empty "properties" maps to objects while
		 * leaving list-valued keys like "required" as arrays.
		 *
		 * @param mixed $node Schema node.
		 * @return mixed Normalized node.
		 */
		private static function normalize_schema( $node ) {
			if ( ! is_array( $node ) ) {
				return $node;
			}

			if ( array_key_exists( 'properties', $node ) ) {
				if ( is_array( $node['properties'] ) && empty( $node['properties'] ) ) {
					$node['properties'] = new stdClass();
				} elseif ( is_array( $node['properties'] ) ) {
					foreach ( $node['properties'] as $key => $child ) {
						$node['properties'][ $key ] = self::normalize_schema( $child );
					}
				}
			}

			if ( array_key_exists( 'items', $node ) && is_array( $node['items'] ) ) {
				$node['items'] = self::normalize_schema( $node['items'] );
			}

			return $node;
		}

		/**
		 * Shape a successful model turn into the sidecar's expected JSON.
		 *
		 * @param \WordPress\AiClient\Results\DTO\GenerativeAiResult $result Model result.
		 * @return WP_REST_Response
		 */
		private static function success_response( $result ) {
			$text       = '';
			$tool_calls = array();

			$message = $result->toMessage();

			foreach ( $message->getParts() as $part ) {
				$part_type = $part->getType();

				if ( $part_type->isText() ) {
					$text .= $part->getText();
				} elseif ( $part_type->isFunctionCall() ) {
					$call         = $part->getFunctionCall();
					$tool_calls[] = array(
						'id'   => $call->getId(),
						'name' => $call->getName(),
						'args' => $call->getArgs(),
					);
				}
			}

			return new WP_REST_Response(
				array(
					'success'    => true,
					'text'       => $text,
					'tool_calls' => $tool_calls,
					'finish'     => empty( $tool_calls ) ? 'stop' : 'tool_use',
				),
				200
			);
		}

		/**
		 * Build a consistent error envelope.
		 *
		 * @param int    $status  HTTP status code.
		 * @param string $code    Machine-readable error code.
		 * @param string $message Human-readable message.
		 * @return WP_REST_Response
		 */
		private static function error_response( $status, $code, $message ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'code'    => $code,
					'error'   => $message,
				),
				$status
			);
		}
	}
}
