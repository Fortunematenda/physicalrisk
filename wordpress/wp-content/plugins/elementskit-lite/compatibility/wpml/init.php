<?php
namespace ElementsKit_Lite\Compatibility\Wpml;

defined( 'ABSPATH' ) || exit;

/**
 * Init
 * Initiate all necessary classes, hooks, configs.
 *
 * @since 1.2.6
 */
class Init {

	/**
	 * @var self
	 */
	private static $instance;

	/**
	 * Ensures only one instance of the plugin class is loaded or can be loaded.
	 *
	 * @since 1.2.6
	 * @return self
	 */
	public static function instance() {
		if ( is_null( self::$instance ) ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * @since 1.2.6
	 */
	public function __construct() {
		if ( defined( 'ICL_SITEPRESS_VERSION' ) ) {
			add_filter( 'elementor/documents/get/post_id', [ $this, 'wpml_template_translation' ] );
		}

		// Brace-to-span bridge for every ElementsKit field that uses the "{...}" focused-text
		// syntax (\ElementsKit_Lite\Utils::kspan): Heading title, Heading shadow text and
		// Testimonial designation. WPML registers these under generic page-builder keys
		// (e.g. "package-string-3-810"), so the conversion is gated on the brace/span token
		// in the value, not on the field key — which makes it cover every kspan field.
		add_filter( 'wpml_tm_translation_job_data', [ $this, 'rewrite_job_data' ], 10, 2 );
		add_filter( 'wpml_tm_job_fields', [ $this, 'rewrite_job_fields' ], 10, 2 );
	}

	/**
	 * Outbound: rewrite the field value sent to ATE when the job is created so the word
	 * inside "{...}" is exposed for translation instead of treated as a placeholder token.
	 */
	public function rewrite_job_data( $package, $post ) {
		if ( empty( $package['contents'] ) || ! is_array( $package['contents'] ) ) {
			return $package;
		}

		foreach ( $package['contents'] as &$field ) {
			if ( empty( $field['data'] ) ) {
				continue;
			}

			$is_base64 = isset( $field['format'] ) && 'base64' === $field['format'];
			$value     = $is_base64 ? base64_decode( $field['data'] ) : $field['data'];

			if ( false === strpos( $value, '{' ) ) {
				continue;
			}

			$value          = $this->braces_to_span( $value );
			$field['data']  = $is_base64 ? base64_encode( $value ) : $value;
		}
		unset( $field );

		return $package;
	}

	/**
	 * Inbound: rewrite the translated value back to braces before it is applied.
	 */
	public function rewrite_job_fields( $fields, $job ) {
		if ( empty( $fields ) ) {
			return $fields;
		}

		foreach ( $fields as &$field ) {
			$translated = $this->get_field_prop( $field, 'field_data_translated' );

			if ( '' === $translated || false === strpos( $translated, '<span>' ) ) {
				continue;
			}

			$is_base64 = 'base64' === $this->get_field_prop( $field, 'field_format' );
			$decoded   = $is_base64 ? base64_decode( $translated ) : $translated;
			$decoded   = $this->span_to_braces( $decoded );
			$encoded   = $is_base64 ? base64_encode( $decoded ) : $decoded;

			$this->set_field_prop( $field, 'field_data_translated', $encoded );
		}
		unset( $field );

		return $fields;
	}

	/**
	 * Read a property from a job field, whether it's an object or an array.
	 *
	 * @param object|array $field
	 * @param string       $key
	 * @return mixed
	 */
	private function get_field_prop( $field, $key ) {
		if ( is_object( $field ) ) {
			return $field->$key ?? '';
		}

		return $field[ $key ] ?? '';
	}

	/**
	 * Write a property on a job field, whether it's an object or an array.
	 *
	 * @param object|array $field
	 * @param string       $key
	 * @param mixed        $value
	 */
	private function set_field_prop( &$field, $key, $value ) {
		if ( is_object( $field ) ) {
			$field->$key = $value;
		} else {
			$field[ $key ] = $value;
		}
	}

	/**
	 * Collapse "{{report}}" or "{report}" into a single <span>report</span> (mirrors
	 * \ElementsKit_Lite\Utils::kspan) so ATE sees an inline tag wrapping translatable text,
	 * not a placeholder token. Lone/unbalanced braces are left untouched.
	 *
	 * @param string $text
	 * @return string
	 */
	public function braces_to_span( $text ) {
		return preg_replace( '/\{+([^{}]*)\}+/', '<span>$1</span>', $text );
	}

	/**
	 * Restore to single-brace "{report}" form; kspan collapses braces to one span on render,
	 * so single braces reproduce the original focused-title output identically.
	 *
	 * @param string $text
	 * @return string
	 */
	public function span_to_braces( $text ) {
		return preg_replace( '/<span>(.*?)<\/span>/s', '{$1}', $text );
	}

	/**
	 * Get the ID in the current language or in another language you specify.
	 *
	 * @param int $element_id
	 * @return int|array Object id, or array of object ids.
	 * @since 2.6.1
	 */
	public function wpml_template_translation( $element_id ) {
		$element_type = get_post_type( $element_id );

		if ( in_array( $element_type, [ 'elementskit_template', 'elementskit_content' ], true ) ) {
			return apply_filters( 'wpml_object_id', $element_id, $element_type, true );
		}

		return $element_id;
	}
}
