<?php
/**
 * Proton Elementor widget.
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Proton_Widget' ) ) {
	class Protuno_Proton_Widget extends \Elementor\Widget_Base {

		public function get_name() {
			return 'proton';
		}

		public function get_title() {
			return esc_html__( 'Proton', 'protuno' );
		}

		public function get_icon() {
			return 'protuno-proton-icon';
		}

		public function get_categories() {
			return array( 'protuno' );
		}

		public function get_keywords() {
			return array( 'html', 'composer', 'dynamic', 'text' );
		}

		protected function register_controls() {

			// ── Content section ───────────────────────────────────────────────────
			$this->start_controls_section(
				'section_content',
				array(
					'label' => esc_html__( 'Text', 'protuno' ),
					'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
				)
			);

			$this->add_control(
				'content_text_edit',
				array(
					'type'      => \Elementor\Controls_Manager::RAW_HTML,
					'raw'       => '<div style="text-align:center;padding:6px 0"><button class="elementor-button elementor-button-default" onclick="elementor.channels.editor.trigger(\'uichemy:composer:edit_layers\')">Add Text</button></div>',
					'condition' => array(
						'raw_html' => '',
						'raw_css'  => '',
						'raw_js'   => '',
					),
				)
			);

			for ( $i = 0; $i < 20; $i++ ) {
				$this->add_control(
					"slot_{$i}_original",
					array(
						'type'    => \Elementor\Controls_Manager::HIDDEN,
						'default' => '',
					)
				);

				$this->add_control(
					"slot_{$i}_visible",
					array(
						'type'    => \Elementor\Controls_Manager::HIDDEN,
						'default' => 'no',
					)
				);

				$this->add_control(
					"slot_{$i}_is_link",
					array(
						'type'    => \Elementor\Controls_Manager::HIDDEN,
						'default' => 'no',
					)
				);

				$this->add_control(
					"slot_{$i}_is_image",
					array(
						'type'    => \Elementor\Controls_Manager::HIDDEN,
						'default' => 'no',
					)
				);

				$this->add_control(
					"slot_{$i}_is_svg",
					array(
						'type'    => \Elementor\Controls_Manager::HIDDEN,
						'default' => 'no',
					)
				);

				$this->add_control(
					"slot_{$i}_svg_mode",
					array(
						'type'    => \Elementor\Controls_Manager::HIDDEN,
						'default' => 'code',
					)
				);

				$this->add_control(
					"slot_{$i}",
					array(
						'label'       => esc_html__( 'Text', 'protuno' ),
						'type'        => \Elementor\Controls_Manager::TEXT,
						'render_type' => 'none',
						'dynamic'     => array(
							'active' => true,
						),
						'condition'   => array(
							"slot_{$i}_visible"  => 'yes',
							"slot_{$i}_is_link"  => 'no',
							"slot_{$i}_is_image" => 'no',
							"slot_{$i}_is_svg"   => 'no',
						),
					)
				);
			}

			$this->add_control(
				'raw_html',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'raw_css',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'raw_js',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'page_custom_code_head',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'page_custom_code_footer',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'site_custom_code_head',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'site_custom_code_footer',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			// 3rd-party asset deps — JSON arrays, one per scope.
			$this->add_control(
				'raw_deps_standard',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'raw_deps_page',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->add_control(
				'raw_deps_site',
				array(
					'type'    => \Elementor\Controls_Manager::HIDDEN,
					'default' => '',
				)
			);

			$this->end_controls_section();

			// ── Links section ────────────────────────────────────────────────────
			$this->start_controls_section(
				'section_link',
				array(
					'label' => esc_html__( 'Links', 'protuno' ),
					'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
				)
			);

			$this->add_control(
				'content_links_edit',
				array(
					'type'      => \Elementor\Controls_Manager::RAW_HTML,
					'raw'       => '<div style="text-align:center;padding:6px 0"><button class="elementor-button elementor-button-default" onclick="elementor.channels.editor.trigger(\'uichemy:composer:edit_layers\')">Add Links</button></div>',
					'condition' => array(
						'raw_html' => '',
						'raw_css'  => '',
						'raw_js'   => '',
					),
				)
			);

			for ( $i = 0; $i < 20; $i++ ) {
				$this->add_control(
					"slot_{$i}_link_text",
					array(
						'label'       => esc_html__( 'Link Text', 'protuno' ),
						'type'        => \Elementor\Controls_Manager::TEXT,
						'render_type' => 'none',
						'dynamic'     => array(
							'active' => true,
						),
						'condition'   => array(
							"slot_{$i}_visible" => 'yes',
							"slot_{$i}_is_link" => 'yes',
						),
					)
				);

				$this->add_control(
					"slot_{$i}_link",
					array(
						'label'   => esc_html__( 'URL', 'protuno' ),
						'type'    => \Elementor\Controls_Manager::URL,
						'dynamic' => array(
							'active' => true,
						),
						'condition' => array(
							"slot_{$i}_visible" => 'yes',
							"slot_{$i}_is_link" => 'yes',
						),
					)
				);
			}

			$this->end_controls_section();

			// ── Media section ─────────────────────────────────────────────────────
			$this->start_controls_section(
				'section_media',
				array(
					'label' => esc_html__( 'Media', 'protuno' ),
					'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
				)
			);

			$this->add_control(
				'content_media_edit',
				array(
					'type'      => \Elementor\Controls_Manager::RAW_HTML,
					'raw'       => '<div style="text-align:center;padding:6px 0"><button class="elementor-button elementor-button-default" onclick="elementor.channels.editor.trigger(\'uichemy:composer:edit_layers\')">Add Media</button></div>',
					'condition' => array(
						'raw_html' => '',
						'raw_css'  => '',
						'raw_js'   => '',
					),
				)
			);

			for ( $i = 0; $i < 20; $i++ ) {
				$this->add_control(
					"slot_{$i}_image",
					array(
						'label'   => esc_html__( 'Choose Image', 'protuno' ),
						'type'    => \Elementor\Controls_Manager::MEDIA,
						'default' => array(
							'url' => '',
							'id'  => '',
						),
						'dynamic' => array(
							'active' => true,
						),
						'condition' => array(
							"slot_{$i}_visible"  => 'yes',
							"slot_{$i}_is_image" => 'yes',
						),
					)
				);

				$this->add_control(
					"slot_{$i}_image_alt",
					array(
						'label'       => esc_html__( 'Alt', 'protuno' ),
						'type'        => \Elementor\Controls_Manager::TEXT,
						'render_type' => 'none',
						'condition'   => array(
							"slot_{$i}_visible"  => 'yes',
							"slot_{$i}_is_image" => 'yes',
						),
					)
				);

				$this->add_control(
					"slot_{$i}_svg_code_media",
					array(
						'label'       => esc_html__( 'Choose SVG', 'protuno' ),
						'type'        => \Elementor\Controls_Manager::MEDIA,
						'media_type'  => 'svg',
						'render_type' => 'none',
						'default'     => array(
							'url' => '',
							'id'  => '',
						),
						'dynamic'     => array(
							'active' => true,
						),
						'condition'   => array(
							"slot_{$i}_visible"  => 'yes',
							"slot_{$i}_is_svg"   => 'yes',
							"slot_{$i}_svg_mode" => 'code',
						),
					)
				);

				$this->add_control(
					"slot_{$i}_svg_code",
					array(
						'type'        => \Elementor\Controls_Manager::HIDDEN,
						'default'     => '',
						'render_type' => 'none',
						'condition'   => array(
							"slot_{$i}_visible"  => 'yes',
							"slot_{$i}_is_svg"   => 'yes',
							"slot_{$i}_svg_mode" => 'code',
						),
					)
				);

				$this->add_control(
					"slot_{$i}_svg_url",
					array(
						'label'      => esc_html__( 'Choose SVG', 'protuno' ),
						'type'       => \Elementor\Controls_Manager::MEDIA,
						'media_type' => 'svg',
						'default'    => array(
							'url' => '',
							'id'  => '',
						),
						'dynamic'    => array(
							'active' => true,
						),
						'condition'  => array(
							"slot_{$i}_visible"  => 'yes',
							"slot_{$i}_is_svg"   => 'yes',
							"slot_{$i}_svg_mode" => 'url',
						),
					)
				);
			}

			$this->end_controls_section();

			$this->start_controls_section(
				'section_style',
				array(
					'label' => esc_html__( 'Proton', 'protuno' ),
					'tab'   => \Elementor\Controls_Manager::TAB_STYLE,
				)
			);

			$this->add_control(
				'style_layers_edit',
				array(
					'label'       => esc_html__( 'Edit Layer', 'protuno' ),
					'type'        => \Elementor\Controls_Manager::BUTTON,
					'button_type' => 'default',
					'text'        => esc_html__( 'Edit', 'protuno' ),
					'event'       => 'uichemy:composer:edit_layers',
				)
			);

			$this->add_control(
				'style_code_edit',
				array(
					'label'       => esc_html__( 'Edit Code', 'protuno' ),
					'type'        => \Elementor\Controls_Manager::BUTTON,
					'button_type' => 'default',
					'text'        => esc_html__( 'Edit', 'protuno' ),
					'event'       => 'uichemy:composer:edit_code',
				)
			);

			$this->add_control(
				'style_chat_edit',
				array(
					'label'       => esc_html__( 'Edit With AI', 'protuno' ),
					'type'        => \Elementor\Controls_Manager::BUTTON,
					'button_type' => 'default',
					'text'        => esc_html__( 'Chat', 'protuno' ),
					'event'       => 'uichemy:composer:edit_chat',
				)
			);

			$this->end_controls_section();
		}

		/**
		 * Build an HTML asset tag (<link> or <script>) from a dep config array.
		 *
		 * @param array $dep Dep entry from raw_deps_* JSON.
		 * @return string HTML tag or empty string.
		 */
		private function build_asset_tag_html( $dep ) {
			$url   = isset( $dep['url'] ) ? trim( (string) $dep['url'] ) : '';
			$ver   = isset( $dep['v'] ) ? trim( (string) $dep['v'] ) : '';
			$kind  = isset( $dep['kind'] ) ? (string) $dep['kind'] : 'script';
			$attrs = isset( $dep['attrs'] ) && is_array( $dep['attrs'] ) ? $dep['attrs'] : array();

			if ( '' === $url ) {
				return '';
			}

			// Replace {v} placeholder.
			if ( '' !== $ver && '—' !== $ver ) {
				$url = str_replace( '{v}', $ver, $url );
			} else {
				$url = str_replace( '{v}', '', $url );
			}

			$url = esc_url( $url );

			if ( 'style' === $kind ) {
				$media = '';
				if ( in_array( 'print', $attrs, true ) ) {
					$media = ' media="print"';
				} elseif ( in_array( 'all', $attrs, true ) ) {
					$media = ' media="all"';
				}
				return '<link rel="stylesheet" href="' . $url . '"' . $media . ' />';
			} else {
				$extra = '';
				if ( in_array( 'defer', $attrs, true ) ) {
					$extra .= ' defer';
				} elseif ( in_array( 'async', $attrs, true ) ) {
					$extra .= ' async';
				}
				if ( in_array( 'module', $attrs, true ) ) {
					$extra .= ' type="module"';
				}
				return '<script src="' . $url . '"' . $extra . '></script>';
			}
		}

		/**
		 * Build asset injection HTML (before-position or after-position) from a JSON deps string.
		 * Returns [ before_html, after_html ].
		 *
		 * @param string $raw_deps_json JSON string from widget setting.
		 * @param bool   $is_editor     Whether we are in the Elementor editor.
		 * @return array{ 0: string, 1: string }
		 */
		private function build_standard_deps_output( $raw_deps_json, $is_editor ) {
			static $injected_urls = array();

			$before = '';
			$after  = '';

			if ( empty( $raw_deps_json ) ) {
				return array( $before, $after );
			}

			$deps = json_decode( $raw_deps_json, true );
			if ( ! is_array( $deps ) ) {
				return array( $before, $after );
			}

			foreach ( $deps as $dep ) {
				if ( empty( $dep['enabled'] ) ) {
					continue;
				}

				$url_key = isset( $dep['url'] ) ? trim( (string) $dep['url'] ) : '';
				if ( '' === $url_key ) {
					continue;
				}

				// Deduplicate across multiple widgets on the same page.
				if ( isset( $injected_urls[ $url_key ] ) ) {
					continue;
				}
				$injected_urls[ $url_key ] = true;

				$tag = $this->build_asset_tag_html( $dep );
				if ( '' === $tag ) {
					continue;
				}

				$position = isset( $dep['position'] ) ? (string) $dep['position'] : 'before';

				// In editor, inject <link> tags via JS into <head> to avoid layout shifts.
				if ( $is_editor && isset( $dep['kind'] ) && 'style' === $dep['kind'] ) {
					$ver     = isset( $dep['v'] ) ? trim( (string) $dep['v'] ) : '';
					$url_raw = isset( $dep['url'] ) ? trim( (string) $dep['url'] ) : '';
					if ( '' !== $ver && '—' !== $ver ) {
						$url_raw = str_replace( '{v}', $ver, $url_raw );
					} else {
						$url_raw = str_replace( '{v}', '', $url_raw );
					}
					$url_raw  = esc_url( $url_raw );
					$url_js   = esc_js( $url_raw );
					$media_attr = '';
					$attrs    = isset( $dep['attrs'] ) && is_array( $dep['attrs'] ) ? $dep['attrs'] : array();
					if ( in_array( 'print', $attrs, true ) ) {
						$media_attr = 'print';
					} elseif ( in_array( 'all', $attrs, true ) ) {
						$media_attr = 'all';
					}
					$media_js = esc_js( $media_attr );
					$js_tag   = "<script>(function(){var u='" . $url_js . "';if(!document.querySelector('link[href=\"'+u+'\"]')){var l=document.createElement('link');l.rel='stylesheet';l.href=u;" . ( $media_attr ? "l.media='" . $media_js . "';" : '' ) . "document.head.appendChild(l);}})();</script>";
					if ( 'after' === $position ) {
						$after .= $js_tag . "\n";
					} else {
						$before .= $js_tag . "\n";
					}
					continue;
				}

				if ( 'after' === $position ) {
					$after .= $tag . "\n";
				} else {
					$before .= $tag . "\n";
				}
			}

			return array( $before, $after );
		}

		private function get_media_url_from_setting( $setting ) {
			if ( is_array( $setting ) ) {
				return trim( (string) ( $setting['url'] ?? '' ) );
			}
			return trim( (string) $setting );
		}

		private function is_svg_url_value( $value ) {
			$normalized = strtolower( trim( (string) $value ) );
			if ( '' === $normalized ) {
				return false;
			}
			if ( preg_match( '/^data:image\/svg\+xml(?:[;,]|$)/i', $normalized ) ) {
				return true;
			}
			return (bool) preg_match( '/\.svg(?:[?#]|$)/i', $normalized );
		}

		private function get_slot_kind( $node ) {
			if ( ! $node instanceof \DOMNode ) {
				return null;
			}
			if ( XML_TEXT_NODE === $node->nodeType ) {
				return 'text';
			}
			if ( XML_ELEMENT_NODE !== $node->nodeType ) {
				return null;
			}
			$tag_name = strtolower( $node->nodeName );
			if ( 'a' === $tag_name ) {
				return 'anchor';
			}
			if ( 'img' === $tag_name ) {
				// img[data-as="svg"] was originally a <svg> tag — keep it as SVG slot.
				// Any other <img> is always an image slot, even if src points to a .svg file.
				if ( 'svg' === $node->getAttribute( 'data-as' ) ) {
					return 'svg';
				}
				return 'image';
			}
			if ( 'svg' === $tag_name ) {
				return 'svg';
			}
			return 'text';
		}

		private function get_text_nodes( $node, $skip_own_text = false ) {
			$text_nodes  = array();
			$inline_tags = array( 'a', 'span', 'strong', 'em', 'b', 'i', 'u', 'label', 'button' );
			$ignore_tags = array( 'style', 'script', 'noscript', 'template' );

			foreach ( $node->childNodes as $child ) {
				if ( XML_TEXT_NODE === $child->nodeType ) {
					// $skip_own_text: this text belongs to a wrapping <a> (its Link
					// Text), so it must not become a standalone text slot.
					if ( $skip_own_text ) {
						continue;
					}
					$val = trim( $child->nodeValue );
					if ( ! empty( $val ) ) {
						$text_nodes[] = $child;
					}
				} elseif ( XML_ELEMENT_NODE === $child->nodeType ) {
					$tag_name = strtolower( $child->nodeName );
					// Skip <uichemy-*> custom elements and their entire subtree.
					// Their inner template tokens (e.g. {nav_item}) are rendered
					// server-side by the PHP extraction layer and must never be
					// treated as editable text slots.
					if ( strncmp( $tag_name, 'uichemy-', 8 ) === 0 ) {
						continue;
					}
					if ( in_array( $tag_name, $ignore_tags, true ) ) {
						continue;
					}
					if ( in_array( $tag_name, array( 'img', 'svg' ), true ) ) {
						$text_nodes[] = $child;
					} elseif ( 'a' === $tag_name && $this->anchor_wraps_slot_content( $child ) ) {
						// <a> wrapping media or block content (e.g.
						// <a>txt<h1>..</h1></a>, <a><img></a>): the anchor is one
						// slot — its URL plus its own direct text as the Link Text —
						// and its children are recursed into separate slots
						// (heading text, nested media, …). The anchor's own text
						// must NOT spawn a standalone text slot, so recurse with
						// $skip_own_text. Mirrors the JS extractSlotTextNodes.
						$text_nodes[] = $child;
						$text_nodes   = array_merge( $text_nodes, $this->get_text_nodes( $child, true ) );
					} elseif ( in_array( $tag_name, $inline_tags, true ) ) {
						// Other inline tags (span, button, …) are a single text
						// slot, unless one wraps an <img>/<svg> — then expose media.
						$has_media = ( $child->getElementsByTagName( 'img' )->length > 0 )
							|| ( $child->getElementsByTagName( 'svg' )->length > 0 );
						if ( $has_media || $this->inline_wraps_block_content( $child ) ) {
							$child_text_nodes = $this->get_text_nodes( $child );
							$text_nodes       = array_merge( $text_nodes, $child_text_nodes );
						} else {
							$inline_text = trim( (string) $child->textContent );
							if ( '' !== $inline_text ) {
								$text_nodes[] = $child;
							}
						}
					} else {
						$child_text_nodes = $this->get_text_nodes( $child );
						$text_nodes       = array_merge( $text_nodes, $child_text_nodes );
					}
				}
			}

			return $text_nodes;
		}

		/**
		 * True when an <a> wraps content that becomes its own slots — nested
		 * <img>/<svg> media, or block elements like <h1>/<div>/<p> carrying text.
		 * Mirrors the JS anchorWrapsSlotContent helper.
		 */
		private function anchor_wraps_slot_content( $node ) {
			if ( ! $node instanceof \DOMElement || 'a' !== strtolower( $node->nodeName ) ) {
				return false;
			}
			$inline_tags = array( 'a', 'span', 'strong', 'em', 'b', 'i', 'u', 'label', 'button' );
			$ignore_tags = array( 'style', 'script', 'noscript', 'template' );
			// Void / empty-content elements never count as block content (e.g. <br>).
			$void_tags = array( 'br', 'wbr', 'hr', 'area', 'base', 'col', 'embed', 'input', 'link', 'meta', 'param', 'source', 'track' );
			foreach ( $node->getElementsByTagName( '*' ) as $el ) {
				$t = strtolower( $el->nodeName );
				if ( strncmp( $t, 'uichemy-', 8 ) === 0 || in_array( $t, $ignore_tags, true ) ) {
					continue;
				}
				if ( in_array( $t, array( 'img', 'svg' ), true ) ) {
					return true; // nested media
				}
				// A block-level element (h1/div/p/…) breaks out — based on
				// STRUCTURE, not text, so emptying its text never collapses the
				// anchor back to a plain text slot (which would wipe the block).
				if ( ! in_array( $t, $inline_tags, true ) && ! in_array( $t, $void_tags, true ) ) {
					return true;
				}
			}
			return false;
		}

		/**
		 * True when a NON-anchor inline slot element (button/label/span/…) wraps
		 * content that must become its own slots — nested <img>/<svg> media, or
		 * block elements like <div>/<h1>/<p>. Mirrors the JS inlineWrapsBlockContent
		 * so editor and published render agree on slot extraction.
		 */
		private function inline_wraps_block_content( $node ) {
			if ( ! $node instanceof \DOMElement ) {
				return false;
			}
			$inline_tags = array( 'a', 'span', 'strong', 'em', 'b', 'i', 'u', 'label', 'button' );
			$ignore_tags = array( 'style', 'script', 'noscript', 'template' );
			$void_tags   = array( 'br', 'wbr', 'hr', 'area', 'base', 'col', 'embed', 'input', 'link', 'meta', 'param', 'source', 'track' );
			foreach ( $node->getElementsByTagName( '*' ) as $el ) {
				$t = strtolower( $el->nodeName );
				if ( strncmp( $t, 'uichemy-', 8 ) === 0 || in_array( $t, $ignore_tags, true ) ) {
					continue;
				}
				if ( in_array( $t, array( 'img', 'svg' ), true ) ) {
					return true; // nested media
				}
				if ( ! in_array( $t, $inline_tags, true ) && ! in_array( $t, $void_tags, true ) ) {
					return true; // block content
				}
			}
			return false;
		}

		/**
		 * Set an anchor's text (Link Text) without removing element children
		 * (nested media/blocks). Mirrors the JS setAnchorTextPreservingChildren.
		 */
		private function set_anchor_text_preserving_children( $node, $text ) {
			if ( ! $node instanceof \DOMElement ) {
				return;
			}
			$safe = (string) $text;
			// Collect the anchor's DIRECT text-node children.
			$text_children = array();
			foreach ( $node->childNodes as $child ) {
				if ( XML_TEXT_NODE === $child->nodeType ) {
					$text_children[] = $child;
				}
			}
			if ( '' === trim( $safe ) ) {
				// Empty link text — drop all stray text nodes, keep media/blocks.
				foreach ( $text_children as $child ) {
					$node->removeChild( $child );
				}
				return;
			}
			if ( empty( $text_children ) ) {
				$text_node = $node->ownerDocument->createTextNode( '' );
				$node->insertBefore( $text_node, $node->firstChild );
				// DOMDocument escapes &, <, > on saveHTML(), so assign the raw
				// value here — pre-escaping with htmlspecialchars() double-encodes
				// (e.g. "&" would render as "&amp;").
				$text_node->nodeValue = $safe;
				return;
			}
			// Consolidate to exactly ONE text node: set the first (preserves its
			// position relative to media/block) to the full value and drop the
			// rest, so read/write stay in sync and Link Text spacing is preserved.
			// Raw value — DOMDocument escapes on output; pre-escaping double-encodes.
			$text_children[0]->nodeValue = $safe;
			for ( $i = 1; $i < count( $text_children ); $i++ ) {
				$node->removeChild( $text_children[ $i ] );
			}
		}

		private function apply_slot_settings_to_node( $node, $settings, $slot_index ) {
			if ( ! $node instanceof \DOMNode ) {
				return;
			}

			$kind = $this->get_slot_kind( $node );

			if ( 'image' === $kind && $node instanceof \DOMElement ) {
				$is_image = isset( $settings[ "slot_{$slot_index}_is_image" ] ) ? $settings[ "slot_{$slot_index}_is_image" ] : 'no';
				if ( 'yes' !== $is_image ) {
					return;
				}
				$image_setting = isset( $settings[ "slot_{$slot_index}_image" ] ) ? $settings[ "slot_{$slot_index}_image" ] : array();
				$url           = $this->get_media_url_from_setting( $image_setting );
				if ( '' !== $url ) {
					$node->setAttribute( 'src', htmlspecialchars( $url, ENT_QUOTES, 'UTF-8' ) );
				} else {
					$node->removeAttribute( 'src' );
				}
				$alt = isset( $settings[ "slot_{$slot_index}_image_alt" ] ) ? trim( (string) $settings[ "slot_{$slot_index}_image_alt" ] ) : '';
				if ( '' !== $alt ) {
					$node->setAttribute( 'alt', htmlspecialchars( $alt, ENT_QUOTES, 'UTF-8' ) );
				} else {
					$node->removeAttribute( 'alt' );
				}
				return;
			}

			if ( 'svg' === $kind && $node instanceof \DOMElement ) {
				$is_svg = isset( $settings[ "slot_{$slot_index}_is_svg" ] ) ? $settings[ "slot_{$slot_index}_is_svg" ] : 'no';
				if ( 'yes' !== $is_svg ) {
					return;
				}
				$svg_mode = isset( $settings[ "slot_{$slot_index}_svg_mode" ] ) ? (string) $settings[ "slot_{$slot_index}_svg_mode" ] : 'code';
				if ( 'url' === $svg_mode ) {
					$url_setting = isset( $settings[ "slot_{$slot_index}_svg_url" ] ) ? $settings[ "slot_{$slot_index}_svg_url" ] : array();
					$url         = $this->get_media_url_from_setting( $url_setting );
					if ( '' === $url ) {
						$tag_name_check = strtolower( $node->nodeName );
						if ( 'svg' === $tag_name_check ) {
							$node->removeAttribute( 'data-uc-svg-source' );
							while ( $node->firstChild ) {
								$node->removeChild( $node->firstChild );
							}
						} elseif ( 'img' === $tag_name_check ) {
							$node->removeAttribute( 'src' );
						}
						return;
					}
					$tag_name = strtolower( $node->nodeName );
					if ( 'img' === $tag_name ) {
						$node->setAttribute( 'src', htmlspecialchars( $url, ENT_QUOTES, 'UTF-8' ) );
						return;
					}
					if ( 'svg' !== $tag_name ) {
						return;
					}
					$node->setAttribute( 'data-uc-svg-source', htmlspecialchars( $url, ENT_QUOTES, 'UTF-8' ) );
					while ( $node->firstChild ) {
						$node->removeChild( $node->firstChild );
					}
					$doc        = $node->ownerDocument;
					$image_node = $doc->createElementNS( 'http://www.w3.org/2000/svg', 'image' );
					$image_node->setAttribute( 'href', $url );
					$image_node->setAttributeNS( 'http://www.w3.org/1999/xlink', 'xlink:href', $url );
					$image_node->setAttribute( 'width', '100%' );
					$image_node->setAttribute( 'height', '100%' );
					$image_node->setAttribute( 'preserveAspectRatio', 'xMidYMid meet' );
					$node->appendChild( $image_node );
					return;
				}

				$svg_code = isset( $settings[ "slot_{$slot_index}_svg_code" ] ) ? trim( (string) $settings[ "slot_{$slot_index}_svg_code" ] ) : '';
				if ( '' === $svg_code || ! preg_match( '/^\s*<svg\b/i', $svg_code ) ) {
					$code_media_setting = isset( $settings[ "slot_{$slot_index}_svg_code_media" ] ) ? $settings[ "slot_{$slot_index}_svg_code_media" ] : array();
					$code_media_url     = $this->get_media_url_from_setting( $code_media_setting );
					if ( '' === $code_media_url ) {
						return;
					}
					$tag_name = strtolower( $node->nodeName );
					if ( 'img' === $tag_name ) {
						$node->setAttribute( 'src', htmlspecialchars( $code_media_url, ENT_QUOTES, 'UTF-8' ) );
						return;
					}
					if ( 'svg' !== $tag_name ) {
						return;
					}
					$node->setAttribute( 'data-uc-svg-source', htmlspecialchars( $code_media_url, ENT_QUOTES, 'UTF-8' ) );
					while ( $node->firstChild ) {
						$node->removeChild( $node->firstChild );
					}
					$doc        = $node->ownerDocument;
					$image_node = $doc->createElementNS( 'http://www.w3.org/2000/svg', 'image' );
					$image_node->setAttribute( 'href', $code_media_url );
					$image_node->setAttributeNS( 'http://www.w3.org/1999/xlink', 'xlink:href', $code_media_url );
					$image_node->setAttribute( 'width', '100%' );
					$image_node->setAttribute( 'height', '100%' );
					$image_node->setAttribute( 'preserveAspectRatio', 'xMidYMid meet' );
					$node->appendChild( $image_node );
					return;
				}
				$parsed_dom = new \DOMDocument();
				libxml_use_internal_errors( true );
				$parsed_dom->loadHTML( '<?xml encoding="utf-8" ?>' . $svg_code, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD );
				libxml_clear_errors();
				$parsed_svg = $parsed_dom->getElementsByTagName( 'svg' )->item( 0 );
				if ( ! $parsed_svg instanceof \DOMElement || ! $node->parentNode instanceof \DOMNode ) {
					return;
				}
				$imported = $node->ownerDocument->importNode( $parsed_svg, true );
				$node->parentNode->replaceChild( $imported, $node );
				return;
			}

			// Link-wrapper anchor (wraps media/blocks): its text content (Link
			// Text) must be written without wiping the nested children — handled
			// below via set_anchor_text_preserving_children, not a raw nodeValue
			// write which would destroy the nested media/heading.
			$anchor_wraps_slots = ( 'anchor' === $kind && $this->anchor_wraps_slot_content( $node ) );

			$is_link  = isset( $settings[ "slot_{$slot_index}_is_link" ] ) && 'yes' === $settings[ "slot_{$slot_index}_is_link" ];
			$slot_val = '';
			if ( $is_link ) {
				$link_text_val = isset( $settings[ "slot_{$slot_index}_link_text" ] ) ? trim( $settings[ "slot_{$slot_index}_link_text" ] ) : '';
				// Fallback to slot_{i} for any existing saved data before the split.
				$slot_val = '' !== $link_text_val ? $link_text_val : ( isset( $settings[ "slot_{$slot_index}" ] ) ? trim( $settings[ "slot_{$slot_index}" ] ) : '' );
			} else {
				$slot_val = isset( $settings[ "slot_{$slot_index}" ] ) ? trim( $settings[ "slot_{$slot_index}" ] ) : '';
			}
			if ( $anchor_wraps_slots ) {
				// Link Text is the SOLE source for a link-wrapper anchor's own
				// text — no slot_{i} fallback, so clearing it removes the text.
				// Nested children (heading/media) are preserved.
				$link_text_only = isset( $settings[ "slot_{$slot_index}_link_text" ] )
					? (string) $settings[ "slot_{$slot_index}_link_text" ]
					: '';
				$this->set_anchor_text_preserving_children( $node, $link_text_only );
			} elseif ( '' !== $slot_val ) {
				// Assign the raw value: DOMDocument escapes &, <, > when the tree
				// is serialized (saveHTML). Pre-escaping with htmlspecialchars()
				// here would double-encode, e.g. "hello &" -> "hello &amp;".
				if ( XML_TEXT_NODE === $node->nodeType || XML_ELEMENT_NODE === $node->nodeType ) {
					$node->nodeValue = $slot_val;
				}
			}

			if ( 'anchor' === $kind && $node instanceof \DOMElement ) {
				$link_setting = isset( $settings[ "slot_{$slot_index}_link" ] ) ? $settings[ "slot_{$slot_index}_link" ] : array();
				$url          = isset( $link_setting['url'] ) ? trim( $link_setting['url'] ) : '';
				if ( ! empty( $url ) ) {
					$node->setAttribute( 'href', htmlspecialchars( $url, ENT_QUOTES, 'UTF-8' ) );
				}
				if ( ! empty( $link_setting['is_external'] ) ) {
					$node->setAttribute( 'target', '_blank' );
				} else {
					$node->removeAttribute( 'target' );
				}
				if ( ! empty( $link_setting['nofollow'] ) ) {
					$node->setAttribute( 'rel', 'nofollow' );
				}
				if ( ! empty( $link_setting['custom_attributes'] ) ) {
					$custom_attributes = preg_split( '/((\r?\n)|\|\||\|)/', $link_setting['custom_attributes'] );
					foreach ( $custom_attributes as $attr ) {
						$attr = explode( '|', trim( $attr ), 2 );
						if ( isset( $attr[0], $attr[1] ) ) {
							$node->setAttribute( trim( $attr[0] ), trim( $attr[1] ) );
						}
					}
				}
			}
		}

		private function scope_css_to_widget( $raw_css, $widget_scope_selector ) {
			$css   = trim( (string) $raw_css );
			$scope = trim( (string) $widget_scope_selector );
			if ( '' === $css || '' === $scope ) {
				return $css;
			}

			$scoped = $this->scope_css_block_to_widget( $css, $scope );
			return $this->reorder_responsive_media_queries_to_end( $scoped );
		}

		/**
		 * Sort top-level @media rules to the END of the scoped CSS so they take precedence over base
		 * rules at the same specificity. Without this, a desktop/base rule written after a @media rule
		 * in raw_css collapses to identical specificity once scoped and wins the cascade by source
		 * order — defeating the breakpoint override on small viewports.
		 */
		private function reorder_responsive_media_queries_to_end( $css ) {
			$text = (string) $css;
			if ( '' === trim( $text ) || false === strpos( $text, '@media' ) ) {
				return $text;
			}

			$blocks = array();
			$offset = 0;
			$len    = strlen( $text );

			while ( $offset < $len ) {
				$pre_start = $offset;
				while ( $offset < $len ) {
					$c = $text[ $offset ];
					if ( ctype_space( $c ) ) {
						$offset++;
						continue;
					}
					if ( '/' === $c && $offset + 1 < $len && '*' === $text[ $offset + 1 ] ) {
						$end = strpos( $text, '*/', $offset + 2 );
						if ( false === $end ) {
							$offset = $len;
							break;
						}
						$offset = $end + 2;
						continue;
					}
					break;
				}
				$prelude = substr( $text, $pre_start, $offset - $pre_start );
				if ( $offset >= $len ) {
					if ( '' !== $prelude ) {
						$blocks[] = array(
							'type' => 'rule',
							'text' => $prelude,
							'max'  => 0.0,
							'min'  => 0.0,
						);
					}
					break;
				}

				$header_start = $offset;
				$quote        = '';
				while ( $offset < $len ) {
					$c = $text[ $offset ];
					$n = $offset + 1 < $len ? $text[ $offset + 1 ] : '';
					if ( '' !== $quote ) {
						if ( '\\' === $c ) {
							$offset += 2;
							continue;
						}
						if ( $c === $quote ) {
							$quote = '';
						}
						$offset++;
						continue;
					}
					if ( '"' === $c || "'" === $c ) {
						$quote = $c;
						$offset++;
						continue;
					}
					if ( '/' === $c && '*' === $n ) {
						$end = strpos( $text, '*/', $offset + 2 );
						if ( false === $end ) {
							$offset = $len;
							break;
						}
						$offset = $end + 2;
						continue;
					}
					if ( '{' === $c || ';' === $c ) {
						break;
					}
					$offset++;
				}
				if ( $offset >= $len ) {
					$blocks[] = array(
						'type' => 'rule',
						'text' => $prelude . substr( $text, $header_start ),
						'max'  => 0.0,
						'min'  => 0.0,
					);
					break;
				}
				if ( ';' === $text[ $offset ] ) {
					$offset++;
					$blocks[] = array(
						'type' => 'rule',
						'text' => $prelude . substr( $text, $header_start, $offset - $header_start ),
						'max'  => 0.0,
						'min'  => 0.0,
					);
					continue;
				}

				$header     = trim( substr( $text, $header_start, $offset - $header_start ) );
				$depth      = 1;
				$body_quote = '';
				$offset++;
				while ( $offset < $len && $depth > 0 ) {
					$c = $text[ $offset ];
					$n = $offset + 1 < $len ? $text[ $offset + 1 ] : '';
					if ( '' !== $body_quote ) {
						if ( '\\' === $c ) {
							$offset += 2;
							continue;
						}
						if ( $c === $body_quote ) {
							$body_quote = '';
						}
						$offset++;
						continue;
					}
					if ( '"' === $c || "'" === $c ) {
						$body_quote = $c;
						$offset++;
						continue;
					}
					if ( '/' === $c && '*' === $n ) {
						$end = strpos( $text, '*/', $offset + 2 );
						if ( false === $end ) {
							$offset = $len;
							break;
						}
						$offset = $end + 2;
						continue;
					}
					if ( '{' === $c ) {
						$depth++;
					} elseif ( '}' === $c ) {
						$depth--;
					}
					$offset++;
				}
				$block_text = $prelude . substr( $text, $header_start, $offset - $header_start );

				if ( preg_match( '/^\s*@media\b/i', $header ) ) {
					$media_text = preg_replace( '/^\s*@media\s+/i', '', $header );
					$max_w      = PHP_INT_MAX;
					$min_w      = 0.0;
					if ( preg_match( '/max-width\s*:\s*([\d.]+)\s*px/i', $media_text, $m ) ) {
						$max_w = (float) $m[1];
					}
					if ( preg_match( '/min-width\s*:\s*([\d.]+)\s*px/i', $media_text, $m ) ) {
						$min_w = (float) $m[1];
					}
					$blocks[] = array(
						'type' => 'media',
						'text' => $block_text,
						'max'  => $max_w,
						'min'  => $min_w,
						'idx'  => count( $blocks ),
					);
				} else {
					$blocks[] = array(
						'type' => 'rule',
						'text' => $block_text,
						'max'  => 0.0,
						'min'  => 0.0,
					);
				}
			}

			$base_blocks  = array();
			$media_blocks = array();
			foreach ( $blocks as $b ) {
				if ( 'media' === $b['type'] ) {
					$media_blocks[] = $b;
				} else {
					$base_blocks[] = $b;
				}
			}
			usort(
				$media_blocks,
				function ( $a, $b ) {
					if ( $a['max'] !== $b['max'] ) {
						return ( $b['max'] - $a['max'] ) > 0 ? 1 : -1;
					}
					if ( $a['min'] !== $b['min'] ) {
						return ( $a['min'] - $b['min'] ) > 0 ? 1 : -1;
					}
					return ( isset( $a['idx'] ) ? $a['idx'] : 0 ) - ( isset( $b['idx'] ) ? $b['idx'] : 0 );
				}
			);

			$out = '';
			foreach ( $base_blocks as $b ) {
				$out .= $b['text'];
			}
			foreach ( $media_blocks as $b ) {
				$out .= $b['text'];
			}
			return $out;
		}

		private function scope_css_block_to_widget( $css, $scope, $base_scope = null ) {
			$css    = (string) $css;
			$output = '';
			$offset = 0;
			$length = strlen( $css );
			$base   = null === $base_scope ? $scope : (string) $base_scope;

			while ( $offset < $length ) {
				$open = $this->find_next_css_open_brace( $css, $offset );
				if ( false === $open ) {
					$output .= substr( $css, $offset );
					break;
				}

				$close = $this->find_matching_css_brace( $css, $open );
				if ( false === $close ) {
					$output .= substr( $css, $offset );
					break;
				}

				$prelude = substr( $css, $offset, $open - $offset );
				$body    = substr( $css, $open + 1, $close - $open - 1 );

				$at_rule_prelude = $prelude;
				$is_at_rule      = (bool) preg_match( '/^\s*@([a-z-]+)/i', $prelude, $matches );
				if ( ! $is_at_rule && preg_match( '/@(media|supports|container|layer|scope|document)\b/i', $prelude, $embedded ) ) {
					// Strip leading garbage (e.g. stale `.elementor-element-x @media (...)` prefix).
					$at_pos          = strpos( $prelude, $embedded[0] );
					$at_rule_prelude = false === $at_pos ? $prelude : substr( $prelude, $at_pos );
					$is_at_rule      = (bool) preg_match( '/^\s*@([a-z-]+)/i', $at_rule_prelude, $matches );
				}
				if ( $is_at_rule ) {
					$at_rule = strtolower( $matches[1] );
					if ( in_array( $at_rule, array( 'media', 'supports', 'container', 'layer', 'scope', 'document' ), true ) ) {
						// Bump specificity inside @media by doubling the base scope. Keeps breakpoint
						// rules winning over higher-specificity base selectors that authored complex
						// chains like `.scope .a .b img { width: 100% }`.
						$inner_scope = 'media' === $at_rule ? $base . $base : $scope;
						$body        = $this->scope_css_block_to_widget( $body, $inner_scope, $base );
					}
					$output .= $at_rule_prelude . '{' . $body . '}';
				} else {
					$scoped_prelude = $this->prefix_css_selector_group( $prelude, $scope, $base );
					$output        .= ( '' === $scoped_prelude ? $prelude : $scoped_prelude ) . '{' . $body . '}';
				}

				$offset = $close + 1;
			}

			return $output;
		}

		private function prefix_css_selector_group( $selector_group, $scope, $base_scope = null ) {
			if ( preg_match( '/^\s*@/', (string) $selector_group ) ) {
				return '';
			}
			$base = null === $base_scope ? $scope : (string) $base_scope;

			$leading_group = '';
			if ( preg_match( '/^(\s*(?:\/\*.*?\*\/\s*)*)(.*)$/s', (string) $selector_group, $group_matches ) ) {
				$leading_group  = isset( $group_matches[1] ) ? $group_matches[1] : '';
				$selector_group = isset( $group_matches[2] ) ? $group_matches[2] : $selector_group;
			}

			$parts  = explode( ',', (string) $selector_group );
			$scoped = array();
			foreach ( $parts as $part ) {
				$selector_leading = '';
				$selector         = (string) $part;
				if ( preg_match( '/^(\s*(?:\/\*.*?\*\/\s*)*)(.*)$/s', $selector, $selector_matches ) ) {
					$selector_leading = isset( $selector_matches[1] ) ? $selector_matches[1] : '';
					$selector         = isset( $selector_matches[2] ) ? $selector_matches[2] : $selector;
				}
				$selector = trim( $selector );
				if ( '' === $selector ) {
					continue;
				}

				$selector = str_ireplace( '{{WRAPPER}}', $scope, $selector );
				$selector = preg_replace(
					'/(^|[\s>+~,(])selector(?=$|[\s>+~#.:,\[])/i',
					'$1' . $scope,
					$selector
				);
				$selector = trim( (string) $selector );
				if ( '' === $selector ) {
					continue;
				}

				$selector_lower = strtolower( $selector );
				if ( 'from' === $selector_lower || 'to' === $selector_lower || preg_match( '/^\d+%$/', $selector ) ) {
					$scoped[] = $selector_leading . $selector;
					continue;
				}
				if ( ':root' === $selector ) {
					$scoped[] = $selector_leading . $scope;
					continue;
				}
				if ( 0 === strpos( $selector, $base ) ) {
					// Already prefixed with the base scope — replace the base with the active (possibly
					// boosted) scope so @media bodies still pick up the doubled-scope specificity.
					$tail     = substr( $selector, strlen( $base ) );
					$scoped[] = $selector_leading . $scope . $tail;
					continue;
				}
				$scoped[] = $selector_leading . $scope . ' ' . $selector;
			}

			return empty( $scoped ) ? '' : $leading_group . implode( ', ', $scoped );
		}

		private function find_next_css_open_brace( $css, $offset ) {
			$length = strlen( $css );
			$quote  = '';

			for ( $i = (int) $offset; $i < $length; $i++ ) {
				$char = $css[ $i ];
				$next = $i + 1 < $length ? $css[ $i + 1 ] : '';

				if ( '' !== $quote ) {
					if ( '\\' === $char ) {
						$i++;
						continue;
					}
					if ( $char === $quote ) {
						$quote = '';
					}
					continue;
				}

				if ( '"' === $char || "'" === $char ) {
					$quote = $char;
					continue;
				}

				if ( '/' === $char && '*' === $next ) {
					$end = strpos( $css, '*/', $i + 2 );
					if ( false === $end ) {
						return false;
					}
					$i = $end + 1;
					continue;
				}

				if ( '{' === $char ) {
					return $i;
				}
			}

			return false;
		}

		private function find_matching_css_brace( $css, $open_index ) {
			$length = strlen( $css );
			$depth  = 0;
			$quote  = '';

			for ( $i = (int) $open_index; $i < $length; $i++ ) {
				$char = $css[ $i ];
				$next = $i + 1 < $length ? $css[ $i + 1 ] : '';

				if ( '' !== $quote ) {
					if ( '\\' === $char ) {
						$i++;
						continue;
					}
					if ( $char === $quote ) {
						$quote = '';
					}
					continue;
				}

				if ( '"' === $char || "'" === $char ) {
					$quote = $char;
					continue;
				}

				if ( '/' === $char && '*' === $next ) {
					$end = strpos( $css, '*/', $i + 2 );
					if ( false === $end ) {
						return false;
					}
					$i = $end + 1;
					continue;
				}

				if ( '{' === $char ) {
					$depth++;
					continue;
				}

				if ( '}' === $char ) {
					$depth--;
					if ( 0 === $depth ) {
						return $i;
					}
				}
			}

			return false;
		}

		/**
		 * Extract <uichemy:*> dynamic tags from HTML before DOMDocument processing.
		 * Replaces each tag with an HTML comment placeholder and returns the
		 * modified HTML plus a map of placeholder index → tag info.
		 *
		 * @param string $html Raw HTML string.
		 * @return array{ 0: string, 1: array } [ modified_html, tag_map ]
		 */
		private function extract_dynamic_tags( $html ) {
			$tag_map  = array();
			$index    = 0;
			$last_pos = 0;

			// Captures: $m[1]=type, $m[2]=attrs, $m[3]=inner content (empty for self-closing tags).
			$html = preg_replace_callback(
				'/<uichemy-([a-z0-9_-]+)((?:\s[^>]*)?)\s*(?:\/>\s*|>([\s\S]*?)<\/uichemy-\1>)/is',
				function ( $m ) use ( &$tag_map, &$index, &$last_pos, $html ) {
					$type    = strtolower( $m[1] );
					$attrs   = trim( $m[2] );
					$content = isset( $m[3] ) ? $m[3] : '';

					// Dynamically find preceding HTML to check if we are wrapped inside an open <nav> tag.
					$pos = strpos( $html, $m[0], $last_pos );
					if ( false === $pos ) {
						$pos = $last_pos;
					}
					$preceding_html = substr( $html, 0, $pos );
					$last_pos       = $pos + strlen( $m[0] );

					$is_wrapped_in_nav = false;
					if ( '' !== $preceding_html ) {
						$nav_open_count  = preg_match_all( '/<nav\b/i', $preceding_html );
						$nav_close_count = preg_match_all( '/<\/nav\b/i', $preceding_html );
						if ( $nav_open_count > $nav_close_count ) {
							$is_wrapped_in_nav = true;
						}
					}

					$tag_map[ $index ] = array(
						'type'              => $type,
						'attrs'             => $attrs,
						'content'           => $content,
						'is_wrapped_in_nav' => $is_wrapped_in_nav,
					);
					$placeholder = "<!-- uich-dyn-{$index} -->";
					$index++;
					return $placeholder;
				},
				$html
			);
			return array( $html, $tag_map );
		}

		/**
		 * Replace comment placeholders produced by extract_dynamic_tags() with
		 * the actual rendered content for each dynamic tag type.
		 *
		 * @param string $output    HTML output string containing placeholders.
		 * @param array  $tag_map   Map of index → ['type', 'attrs'].
		 * @param bool   $is_editor Whether rendering inside the Elementor editor.
		 * @return string Final HTML with dynamic tags resolved.
		 */
		private function restore_dynamic_tags( $output, $tag_map, $is_editor ) {
			if ( empty( $tag_map ) ) {
				return $output;
			}
			return preg_replace_callback(
				'/<!-- uich-dyn-(\d+) -->/',
				function ( $m ) use ( $tag_map, $is_editor ) {
					$key = (int) $m[1];
					if ( ! isset( $tag_map[ $key ] ) ) {
						return '';
					}
					return $this->render_dynamic_tag_content(
						$tag_map[ $key ]['type'],
						$tag_map[ $key ]['attrs'],
						$is_editor,
						$tag_map[ $key ]['content'] ?? '',
						$tag_map[ $key ]['is_wrapped_in_nav'] ?? false
					);
				},
				$output
			);
		}

		/**
		 * Resolve which post ID to pull content from.
		 * In the editor the global post is the template — walk up to the current
		 * Elementor document, or fall back to the latest published post.
		 *
		 * @param bool $is_editor
		 * @return int Post ID, or 0 if none found.
		 */
		private function resolve_preview_post_id( $is_editor ) {
			$post_id = get_the_ID();

			if ( ! $is_editor ) {
				return (int) $post_id;
			}

			$editor_post_id = 0;
			if ( class_exists( '\Elementor\Plugin' )
				&& isset( \Elementor\Plugin::$instance->documents )
			) {
				$current_doc = \Elementor\Plugin::$instance->documents->get_current();
				if ( $current_doc ) {
					$editor_post_id = $current_doc->get_main_id();
				}
			}

			if ( ! $editor_post_id ) {
				$editor_post_id = (int) $post_id;
			}

			$post_type       = $editor_post_id ? get_post_type( $editor_post_id ) : false;
			$is_real_content = $editor_post_id && $post_type && 'elementor_library' !== $post_type;

			if ( ! $is_real_content ) {
				$fallback = get_posts( array(
					'numberposts' => 1,
					'post_status' => 'publish',
					'post_type'   => 'post',
					'orderby'     => 'date',
					'order'       => 'DESC',
				) );
				$editor_post_id = ! empty( $fallback ) ? (int) $fallback[0]->ID : 0;
			}

			return $editor_post_id;
		}

		/**
		 * Walk the filtered post content and ensure every heading has an id=""
		 * attribute. Headings that already carry an id are left untouched.
		 * Duplicate slugs get a numeric suffix (-2, -3 …).
		 *
		 * @param string $content Filtered post content HTML.
		 * @return string Content with id attributes injected on headings.
		 */
		private function apply_heading_ids( $content ) {
			$id_count = array();
			return preg_replace_callback(
				'/<(h[1-6])([^>]*?)>(.*?)<\/h[1-6]>/is',
				function ( $m ) use ( &$id_count ) {
					$tag   = $m[1];
					$attrs = $m[2];
					$inner = $m[3];
					if ( preg_match( '/\bid\s*=/i', $attrs ) ) {
						return $m[0]; // already has id
					}
					$base = sanitize_title( wp_strip_all_tags( $inner ) );
					if ( ! $base ) {
						return $m[0];
					}
					$id = $base;
					if ( isset( $id_count[ $base ] ) ) {
						$id_count[ $base ]++;
						$id = $base . '-' . $id_count[ $base ];
					} else {
						$id_count[ $base ] = 0;
					}
					return "<{$tag}{$attrs} id=\"" . esc_attr( $id ) . "\">{$inner}</{$tag}>";
				},
				$content
			);
		}

		/**
		 * Extract an ordered list of headings from filtered content, resolving
		 * the same id="" values that apply_heading_ids() would produce.
		 *
		 * @param string $content Filtered post content HTML (already has heading ids, or not).
		 * @return array[] Each entry: [ 'level' => int, 'text' => string, 'id' => string ]
		 */
		private function extract_headings( $content ) {
			preg_match_all( '/<h([1-6])([^>]*?)>(.*?)<\/h[1-6]>/is', $content, $matches, PREG_SET_ORDER );
			$id_count = array();
			$headings = array();
			foreach ( $matches as $m ) {
				$level = (int) $m[1];
				$attrs = $m[2];
				$inner = $m[3];
				$text  = wp_strip_all_tags( $inner );
				if ( preg_match( '/\bid\s*=\s*["\']([^"\']*)["\']/', $attrs, $id_m ) ) {
					$id = trim( $id_m[1] );
				} else {
					$base = sanitize_title( $text );
					if ( ! $base ) {
						continue;
					}
					$id = $base;
					if ( isset( $id_count[ $base ] ) ) {
						$id_count[ $base ]++;
						$id = $base . '-' . $id_count[ $base ];
					} else {
						$id_count[ $base ] = 0;
					}
				}
				if ( $id ) {
					$headings[] = array(
						'level' => $level,
						'text'  => $text,
						'id'    => $id,
					);
				}
			}
			return $headings;
		}

		/**
		 * Parse the template content inside <uichemy-nav-menu> to extract class names
		 * and structural options for the rendered menu.
		 *
		 * Recognises:
		 *   <li for="nav_item in nav_menu" class="…">
		 *   <ul if="sub_items in nav_item" class="…">
		 *   <li for="sub_item in nav_item.sub_items" class="…">
		 *
		 * @param string $content Inner HTML of the <uichemy-nav-menu> tag.
		 * @return array{item_class:string, has_submenu:bool, submenu_attrs:string, sub_item_class:string}
		 */
		private function parse_nav_template( $content ) {
			$item_class     = '';
			$has_submenu    = false;
			$submenu_attrs  = '';
			$sub_item_class = '';

			// Top-level item: <li for="nav_item in nav_menu" …>
			if ( preg_match( '/<li\b([^>]*?)\bfor=["\']nav_item\s+in\s+nav_menu["\'][^>]*>/i', $content, $m ) ) {
				if ( preg_match( '/\bclass=["\']([^"\']*)["\']/', $m[0], $cm ) ) {
					$item_class = trim( $cm[1] );
				}
			}

			// Submenu container: <ul if="sub_items in nav_item" …>
			if ( preg_match( '/<ul\b([^>]*?)\bif=["\']sub_items\s+in\s+nav_item["\'][^>]*>/i', $content, $m ) ) {
				$has_submenu = true;
				// Collect attrs from the <ul> tag excluding the if="" directive.
				$ul_tag     = $m[0];
				$clean_tag  = preg_replace( '/\s*\bif=["\'][^"\']*["\']/', '', $ul_tag );
				$inner_attrs = preg_replace( '/^<ul\s*|\s*>$/', '', trim( $clean_tag ) );
				$submenu_attrs = trim( (string) $inner_attrs );
			}

			// Sub-item: <li for="sub_item in nav_item.sub_items" …>
			if ( preg_match( '/<li\b[^>]*\bfor=["\']sub_item\s+in\s+nav_item\.sub_items["\'][^>]*>/i', $content, $m ) ) {
				if ( preg_match( '/\bclass=["\']([^"\']*)["\']/', $m[0], $cm ) ) {
					$sub_item_class = trim( $cm[1] );
				}
			}

			return array(
				'item_class'    => $item_class,
				'has_submenu'   => $has_submenu,
				'submenu_attrs' => $submenu_attrs,
				'sub_item_class' => $sub_item_class,
			);
		}

		/**
		 * Fetch the active WordPress navigation menu items.
		 * Tries common theme location names in priority order, then falls back
		 * to the first registered location.
		 *
		 * @return array{ top: WP_Post[], by_parent: array<int, WP_Post[]> }|array Empty on failure.
		 */
		private function get_active_nav_menu_items() {
			$locations = get_nav_menu_locations();
			$menu_id   = 0;

			if ( ! empty( $locations ) && is_array( $locations ) ) {
				// Normalize keys to lowercase for a case-insensitive search
				$normalized_locations = array();
				foreach ( $locations as $k => $v ) {
					$normalized_locations[ strtolower( $k ) ] = (int) $v;
				}

				foreach ( array( 'primary', 'main', 'header', 'primary-menu', 'main-navigation', 'header-menu', 'menu-1' ) as $loc ) {
					if ( ! empty( $normalized_locations[ $loc ] ) ) {
						$menu_id = $normalized_locations[ $loc ];
						break;
					}
				}

				// If priority locations are not found/assigned, look for ANY active assigned location
				if ( ! $menu_id ) {
					foreach ( $locations as $loc_slug => $loc_menu_id ) {
						if ( ! empty( $loc_menu_id ) ) {
							$menu_id = (int) $loc_menu_id;
							break;
						}
					}
				}
			}

			// No location-assigned menu found — fall back to the first registered menu
			if ( ! $menu_id ) {
				$all_menus = wp_get_nav_menus();
				if ( ! empty( $all_menus ) && ! is_wp_error( $all_menus ) ) {
					$menu_id = (int) $all_menus[0]->term_id;
				}
			}

			if ( ! $menu_id ) {
				return array();
			}

			$items = wp_get_nav_menu_items( $menu_id );
			if ( ! $items || is_wp_error( $items ) ) {
				return array();
			}

			$top_level = array();
			$by_parent = array();
			foreach ( $items as $item ) {
				$pid = (int) $item->menu_item_parent;
				if ( 0 === $pid ) {
					$top_level[] = $item;
				} else {
					$by_parent[ $pid ][] = $item;
				}
			}

			return array( 'top' => $top_level, 'by_parent' => $by_parent );
		}

		/**
		 * Build the final <nav> HTML for a nav-menu tag using parsed template config
		 * and fetched menu items.
		 *
		/**
		 * Build the final <nav> or <ul> HTML for a nav-menu tag using parsed template config
		 * and fetched menu items.
		 *
		 * @param array  $tpl        Output of parse_nav_template().
		 * @param array  $menu_data  Output of get_active_nav_menu_items().
		 * @param string $outer_attrs Attribute string for the outer <nav> (from the tag).
		 * @param bool   $is_wrapped_in_nav Whether the tag is already wrapped in a <nav> container.
		 * @return string
		 */
		private function render_nav_menu_html( $tpl, $menu_data, $outer_attrs, $is_wrapped_in_nav = false ) {
			$top       = $menu_data['top'];
			$by_parent = $menu_data['by_parent'];

			$item_class     = $tpl['item_class'];
			$sub_item_class = $tpl['sub_item_class'];
			$submenu_attrs  = $tpl['submenu_attrs'];

			$items_html = '';
			foreach ( $top as $item ) {
				$item_id      = (int) $item->ID;
				$sub_items    = isset( $by_parent[ $item_id ] ) ? $by_parent[ $item_id ] : array();
				$has_children = count( $sub_items ) > 0;

				// Use only user-defined classes — no auto-injected modifiers.
				$li_attr = $item_class ? ' class="' . esc_attr( $item_class ) . '"' : '';
				$link    = '<a href="' . esc_url( $item->url ) . '">' . esc_html( $item->title ) . '</a>';

				$submenu_html = '';
				if ( $has_children ) {
					$sub_html = '';
					foreach ( $sub_items as $sub ) {
						$sub_link  = '<a href="' . esc_url( $sub->url ) . '">' . esc_html( $sub->title ) . '</a>';
						$sub_class = $sub_item_class ? ' class="' . esc_attr( $sub_item_class ) . '"' : '';
						$sub_html .= '<li' . $sub_class . '>' . $sub_link . '</li>';
					}
					// Wrap submenu with user-defined attrs (class, etc.) from <ul if="…">.
					$ul_open      = '<ul' . ( $submenu_attrs ? ' ' . $submenu_attrs : '' ) . '>';
					$submenu_html = $ul_open . $sub_html . '</ul>';
				}

				$items_html .= '<li' . $li_attr . '>' . $link . $submenu_html . '</li>';
			}

			$outer_attr = $outer_attrs ? ' ' . $outer_attrs : '';
			if ( $is_wrapped_in_nav ) {
				// Render direct <ul> so horizontal/vertical flex/grid layouts and BEM selector specificity are perfectly preserved
				return '<ul' . $outer_attr . '>' . $items_html . '</ul>';
			}

			// Outer tag becomes <nav> with a <ul> wrapper so <li> items are
			// valid HTML children and browsers / DOMDocument never auto-insert
			// an implicit <ul> that would shift CSS selector specificity.
			return '<nav' . $outer_attr . '><ul>' . $items_html . '</ul></nav>';
		}

		/**
		 * Parse the template content inside <uichemy-toc> to extract class names
		 * and structural options for the rendered TOC.
		 *
		 * Recognises:
		 *   <li for="heading in headings" class="…">
		 *   <ul if="sub_headings in heading" class="…">
		 *   <li for="sub_heading in heading.sub_headings" class="…">
		 *
		 * @param string $content Inner HTML of the <uichemy-toc> tag.
		 * @return array{item_class:string, has_submenu:bool, submenu_attrs:string, sub_item_class:string}
		 */
		private function parse_toc_template( $content ) {
			$item_class     = '';
			$has_submenu    = false;
			$submenu_attrs  = '';
			$sub_item_class = '';

			// Top-level item: <li for="heading in headings" …>
			if ( preg_match( '/<li\b[^>]*\bfor=["\']heading\s+in\s+headings["\'][^>]*>/i', $content, $m ) ) {
				if ( preg_match( '/\bclass=["\']([^"\']*)["\']/', $m[0], $cm ) ) {
					$item_class = trim( $cm[1] );
				}
			}

			// Submenu container: <ul if="sub_headings in heading" …>
			if ( preg_match( '/<ul\b[^>]*\bif=["\']sub_headings\s+in\s+heading["\'][^>]*>/i', $content, $m ) ) {
				$has_submenu = true;
				$ul_tag      = $m[0];
				$clean_tag   = preg_replace( '/\s*\bif=["\'][^"\']*["\']/', '', $ul_tag );
				$inner_attrs = preg_replace( '/^<ul\s*|\s*>$/', '', trim( $clean_tag ) );
				$submenu_attrs = trim( (string) $inner_attrs );
			}

			// Sub-item: <li for="sub_heading in heading.sub_headings" …>
			if ( preg_match( '/<li\b[^>]*\bfor=["\']sub_heading\s+in\s+heading\.sub_headings["\'][^>]*>/i', $content, $m ) ) {
				if ( preg_match( '/\bclass=["\']([^"\']*)["\']/', $m[0], $cm ) ) {
					$sub_item_class = trim( $cm[1] );
				}
			}

			return array(
				'item_class'     => $item_class,
				'has_submenu'    => $has_submenu,
				'submenu_attrs'  => $submenu_attrs,
				'sub_item_class' => $sub_item_class,
			);
		}

		/**
		 * Convert a flat ordered heading list into a two-level tree:
		 * top-level headings (those with no shallower ancestor in the list)
		 * and their direct/indirect children grouped by parent heading id.
		 *
		 * Uses a depth-stack so the parent of any heading is always the nearest
		 * preceding heading at a shallower level, regardless of how many levels
		 * are skipped.
		 *
		 * @param array[] $headings Output of extract_headings().
		 * @return array{ top: array[], by_parent: array<string, array[]> }
		 */
		private function build_heading_tree( $headings ) {
			$top       = array();
			$by_parent = array();
			$stack     = array(); // each entry is a heading array

			foreach ( $headings as $h ) {
				$level = (int) $h['level'];

				// Pop entries at the same or deeper level — they are closed.
				while ( ! empty( $stack ) && (int) end( $stack )['level'] >= $level ) {
					array_pop( $stack );
				}

				if ( empty( $stack ) ) {
					$top[] = $h;
				} else {
					$parent_id                 = end( $stack )['id'];
					$by_parent[ $parent_id ][] = $h;
				}

				$stack[] = $h;
			}

			return array( 'top' => $top, 'by_parent' => $by_parent );
		}

		/**
		 * Build the final TOC HTML using parsed template config and the heading tree.
		 * Rendering is fully recursive — h3 inside h2 inside h1 all work correctly,
		 * with the sub-item template (class + ul attrs) re-applied at every depth.
		 *
		 * @param array  $tpl          Output of parse_toc_template().
		 * @param array  $heading_data Output of build_heading_tree().
		 * @param string $outer_attrs  Attribute string for the outer <nav> (from the tag).
		 * @return string
		 */
		private function render_toc_html( $tpl, $heading_data, $outer_attrs ) {
			$by_parent      = $heading_data['by_parent'];
			$item_class     = $tpl['item_class'];
			$sub_item_class = $tpl['sub_item_class'];
			$submenu_attrs  = $tpl['submenu_attrs'];
			$has_sub_tpl    = $tpl['has_submenu'];

			/**
			 * Recursively render a list of headings.
			 * Top-level items use $item_class; every deeper level uses $sub_item_class.
			 * The same $submenu_attrs <ul> wrapper is applied at every nesting depth.
			 */
			$render_items = null;
			$render_items = function( $items, $is_top_level ) use (
				&$render_items, $by_parent,
				$item_class, $sub_item_class, $submenu_attrs, $has_sub_tpl
			) {
				$html = '';
				foreach ( $items as $h ) {
					$li_class = $is_top_level ? $item_class : $sub_item_class;
					$li_attr  = $li_class ? ' class="' . esc_attr( $li_class ) . '"' : '';
					$link     = '<a href="#' . esc_attr( $h['id'] ) . '">' . esc_html( $h['text'] ) . '</a>';

					$sub_items    = $has_sub_tpl && isset( $by_parent[ $h['id'] ] ) ? $by_parent[ $h['id'] ] : array();
					$submenu_html = '';
					if ( ! empty( $sub_items ) ) {
						$ul_open      = '<ul' . ( $submenu_attrs ? ' ' . $submenu_attrs : '' ) . '>';
						$submenu_html = $ul_open . $render_items( $sub_items, false ) . '</ul>';
					}

					$html .= '<li' . $li_attr . '>' . $link . $submenu_html . '</li>';
				}
				return $html;
			};

			$nav_attr = $outer_attrs ? ' ' . $outer_attrs : '';
			return '<nav' . $nav_attr . '>' . $render_items( $heading_data['top'], true ) . '</nav>';
		}

		/**
		 * Render the output for a single <uichemy-*> dynamic tag.
		 *
		 * @param string $type              Tag type slug (e.g. 'post-content', 'toc', 'nav-menu').
		 * @param string $attrs_str         Raw attribute string from the original tag.
		 * @param bool   $is_editor         Whether rendering inside the Elementor editor.
		 * @param string $content           Inner HTML content of the tag (for content-bearing tags).
		 * @param bool   $is_wrapped_in_nav Whether the tag is already wrapped in a <nav> container.
		 * @return string Rendered HTML.
		 */
		private function render_dynamic_tag_content( $type, $attrs_str, $is_editor, $content = '', $is_wrapped_in_nav = false ) {
			$attrs_str = trim( $attrs_str );
			$attr_open = $attrs_str ? ' ' . $attrs_str : '';
			$open_tag  = "<div{$attr_open}>";
			$close_tag = '</div>';

			$post_id = $this->resolve_preview_post_id( $is_editor );

			// ── post-content ──────────────────────────────────────────────────────
			if ( 'post-content' === $type ) {
				$post_content = '';
				if ( $post_id ) {
					$post_content = apply_filters( 'the_content', get_post_field( 'post_content', $post_id ) );
					// Ensure headings carry id="" so <uichemy-toc /> links resolve.
					$post_content = $this->apply_heading_ids( $post_content );
				}
				if ( $attrs_str ) {
					return $open_tag . $post_content . $close_tag;
				}
				return $post_content;
			}

			// ── toc ───────────────────────────────────────────────────────────────
			if ( 'toc' === $type ) {
				$heading_data = array( 'top' => array(), 'by_parent' => array() );
				if ( $post_id ) {
					$post_content = apply_filters( 'the_content', get_post_field( 'post_content', $post_id ) );
					$headings     = $this->extract_headings( $post_content );
					$heading_data = $this->build_heading_tree( $headings );
				}
				if ( empty( $heading_data['top'] ) ) {
					$nav_attr = $attrs_str ? ' ' . $attrs_str : '';
					return '<nav' . $nav_attr . '></nav>';
				}
				$tpl = $content
					? $this->parse_toc_template( $content )
					: array(
						'item_class'     => '',
						'has_submenu'    => true,
						'submenu_attrs'  => '',
						'sub_item_class' => '',
					);
				return $this->render_toc_html( $tpl, $heading_data, $attrs_str );
			}

			// ── site-logo ─────────────────────────────────────────────────────────
			// Renders the WordPress "Site Logo" (set via Appearance → Customize →
			// Site Identity → Logo). The default output is a clickable link to
			// the home URL wrapping an <img> with width/height/alt resolved from
			// the attachment. Any attrs on the tag are passed through to the
			// wrapping <a> element (e.g. `class="site-logo"` or `data-foo="bar"`).
			//
			//   Self-closing:   <uichemy-site-logo />
			//   With class:     <uichemy-site-logo class="header-logo" />
			//
			// If no custom logo is configured on the site, the site name is
			// rendered as a text fallback inside the same <a> wrapper so the
			// header doesn't collapse during preview.
			if ( 'site-logo' === $type ) {
				$logo_url    = '';
				$logo_width  = 0;
				$logo_height = 0;
				$logo_alt    = '';

				$logo_id = (int) get_theme_mod( 'custom_logo' );
				if ( $logo_id ) {
					// Prefer the design-sourced dimensions set by set_site_branding()
					// (stored as attachment meta). WP core's wp_get_attachment_image_src()
					// returns false for SVG logos (wp_attachment_is_image() doesn't
					// recognize image/svg+xml), which would otherwise render a blank
					// <img> for a text/vector logo — this meta covers both the "right
					// size" and the "SVG renders at all" cases.
					$meta_width  = (int) get_post_meta( $logo_id, '_uich_logo_width', true );
					$meta_height = (int) get_post_meta( $logo_id, '_uich_logo_height', true );
					if ( $meta_width && $meta_height ) {
						$logo_url    = (string) wp_get_attachment_url( $logo_id );
						$logo_width  = $meta_width;
						$logo_height = $meta_height;
					} else {
						$logo_src = wp_get_attachment_image_src( $logo_id, 'full' );
						if ( $logo_src ) {
							$logo_url    = (string) $logo_src[0];
							$logo_width  = (int) $logo_src[1];
							$logo_height = (int) $logo_src[2];
						}
					}
					if ( $logo_url ) {
						$logo_alt = (string) get_post_meta( $logo_id, '_wp_attachment_image_alt', true );
					}
				}
				if ( '' === $logo_alt ) {
					$logo_alt = (string) get_bloginfo( 'name' );
				}

				$home_url = esc_url( home_url( '/' ) );
				$a_attr   = $attrs_str ? ' ' . $attrs_str : '';

				if ( '' === $logo_url ) {
					// No custom logo set — render a branded icon mark using the
					// site's first Elementor global color (falls back to Protuno
					// brand purple). Never shows the site name as plain text.
					$brand_color = '#6c3ff5';
					if ( class_exists( '\Elementor\Plugin' ) ) {
						try {
							$kit      = \Elementor\Plugin::$instance->kits_manager->get_active_kit_for_frontend();
							$settings = $kit ? $kit->get_settings_for_display() : array();
							// Atomic mode stores colors in 'custom_colors'; classic in 'system_colors'
							$colors = ! empty( $settings['custom_colors'] ) ? $settings['custom_colors']
								: ( ! empty( $settings['system_colors'] ) ? $settings['system_colors'] : array() );
							foreach ( $colors as $color_item ) {
								if ( ! empty( $color_item['color'] ) && '#' === substr( $color_item['color'], 0, 1 ) ) {
									$brand_color = esc_attr( $color_item['color'] );
									break;
								}
							}
						} catch ( \Exception $e ) {
							// Ignore — keep the default brand color
						}
					}
					// "U" arc mark — two vertical bars joined at the bottom with a curve.
					$svg = '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">'
						. '<rect width="36" height="36" rx="8" fill="' . $brand_color . '"/>'
						. '<path d="M11 11v10q0 4 7 4t7-4V11" stroke="white" stroke-width="2.8" stroke-linecap="round" fill="none"/>'
						. '</svg>';
					return '<a' . $a_attr . ' href="' . $home_url . '" style="display:inline-block;line-height:0;">' . $svg . '</a>';
				}

				return sprintf(
					'<a%s href="%s"><img src="%s" width="%d" height="%d" alt="%s" /></a>',
					$a_attr,
					$home_url,
					esc_url( $logo_url ),
					$logo_width,
					$logo_height,
					esc_attr( $logo_alt )
				);
			}

			// ── site-icon ─────────────────────────────────────────────────────────
			// Renders the WordPress "Site Icon" — the favicon set via Appearance
			// → Customize → Site Identity → Site Icon. This is a DIFFERENT
			// setting from the Site Logo (favicons live in `option('site_icon')`,
			// not in the `custom_logo` theme mod). Useful when you want the
			// browser-tab icon inside your header (e.g. as a small avatar next
			// to the brand name, or as a mobile-only logo).
			//
			//   Self-closing:        <uichemy-site-icon />
			//   With class + size:   <uichemy-site-icon class="favicon" data-size="64" />
			//
			// Attrs are forwarded to the wrapping <a>. The optional `data-size`
			// attr picks which generated favicon size to load (WordPress emits
			// 32 / 192 / 270 / 512 by default — 192 is the safe default for a
			// crisp render at normal CSS sizes).
			if ( 'site-icon' === $type ) {
				$icon_size = 192;
				if ( $attrs_str && preg_match( '/\bdata-size\s*=\s*"(\d+)"/i', $attrs_str, $sm ) ) {
					$icon_size = max( 16, (int) $sm[1] );
				}

				$icon_url = function_exists( 'get_site_icon_url' ) ? (string) get_site_icon_url( $icon_size ) : '';
				$home_url = esc_url( home_url( '/' ) );
				$a_attr   = $attrs_str ? ' ' . $attrs_str : '';

				if ( '' === $icon_url ) {
					// No site icon configured — fall back to a clearly-empty
					// link so the user sees that the slot exists in the layout
					// but knows they still need to upload one in Customize.
					return '<a' . $a_attr . ' href="' . $home_url . '"></a>';
				}

				$icon_alt = (string) get_bloginfo( 'name' );

				return sprintf(
					'<a%s href="%s"><img src="%s" width="%d" height="%d" alt="%s" /></a>',
					$a_attr,
					$home_url,
					esc_url( $icon_url ),
					$icon_size,
					$icon_size,
					esc_attr( $icon_alt )
				);
			}

			// ── nav-menu ──────────────────────────────────────────────────────────
			if ( 'nav-menu' === $type ) {
				$menu_data = $this->get_active_nav_menu_items();
				if ( empty( $menu_data ) ) {
					$nav_attr = $attrs_str ? ' ' . $attrs_str : '';
					return $is_wrapped_in_nav ? '<ul' . $nav_attr . '></ul>' : '<nav' . $nav_attr . '></nav>';
				}
				$tpl = $content
					? $this->parse_nav_template( $content )
					: array(
						'item_class'     => '',
						'has_submenu'    => true,
						'submenu_attrs'  => '',
						'sub_item_class' => '',
					);
				return $this->render_nav_menu_html( $tpl, $menu_data, $attrs_str, $is_wrapped_in_nav );
			}

			return '';
		}

		protected function render() {
			$settings = $this->get_settings_for_display();

			if ( empty( $settings['raw_html'] ) ) {
				return;
			}

			$is_editor = class_exists( '\Elementor\Plugin' )
				&& isset( \Elementor\Plugin::$instance->editor )
				&& \Elementor\Plugin::$instance->editor->is_edit_mode();

			// Extract <uichemy:*> dynamic tags before DOMDocument sees them so
			// libxml does not mangle the custom namespace-like tag names.
			[ $raw_html_for_dom, $dynamic_tag_map ] = $this->extract_dynamic_tags( $settings['raw_html'] );

			$dom                     = new \DOMDocument();
			$dom->preserveWhiteSpace = true;

			libxml_use_internal_errors( true );
			$dom->loadHTML( '<?xml encoding="utf-8" ?>' . $raw_html_for_dom, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD );
			libxml_clear_errors();

			$text_nodes = $this->get_text_nodes( $dom );

			foreach ( $text_nodes as $i => $node ) {
				if ( $i >= 20 ) {
					break;
				}
				$this->apply_slot_settings_to_node( $node, $settings, $i );
			}

			$widget_scope_selector = '.elementor-element-' . $this->get_id();
			$style_nodes           = $dom->getElementsByTagName( 'style' );
			if ( $style_nodes && $style_nodes->length > 0 ) {
				for ( $s = 0; $s < $style_nodes->length; $s++ ) {
					$style_node = $style_nodes->item( $s );
					if ( ! $style_node instanceof \DOMElement ) {
						continue;
					}
					$raw_style_css = '';
					foreach ( $style_node->childNodes as $style_child ) {
						$raw_style_css .= $style_child->nodeValue;
					}
					$style_node->nodeValue = $this->scope_css_to_widget( $raw_style_css, $widget_scope_selector );
				}
			}

			$output = '';
			foreach ( $dom->childNodes as $child ) {
				$output .= $dom->saveHTML( $child );
			}

			$output = str_replace( '<?xml encoding="utf-8" ?>', '', $output );

			// Restore dynamic tags with their rendered content.
			$output = $this->restore_dynamic_tags( $output, $dynamic_tag_map, $is_editor );

			// Inject standard-scope 3rd-party assets.
			[ $deps_before, $deps_after ] = $this->build_standard_deps_output(
				! empty( $settings['raw_deps_standard'] ) ? $settings['raw_deps_standard'] : '',
				$is_editor
			);

			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			if ( '' !== $deps_before ) echo $deps_before;

			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo $output;

			if ( ! empty( $settings['raw_css'] ) ) {
				$scoped_css = $this->scope_css_to_widget( $settings['raw_css'], $widget_scope_selector );

				if ( $is_editor ) {
					// In the editor, inject CSS via JS into <head> so it is never inside
					// the widget's inner HTML. This means the CSS survives Elementor's
					// widget re-render cycle (panel open/close, settings changes) without
					// any flash or layout collapse — <head> styles are untouched by DOM
					// updates to the widget container.
					$widget_id  = esc_js( $this->get_id() );
					$css_json   = wp_json_encode( $scoped_css );
					// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					echo "<script>(function(){var id='uich-w-" . $widget_id . "';var old=document.getElementById(id);if(old)old.parentNode.removeChild(old);var s=document.createElement('style');s.id=id;s.textContent=" . $css_json . ";document.head.appendChild(s);})();</script>";
				} else {
					// On the frontend there are no re-renders — inline <style> is fine.
					// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					echo '<style>' . $scoped_css . '</style>';
				}
			}

			if ( ! empty( $settings['raw_js'] ) ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo '<script>' . $settings['raw_js'] . '</script>';
			}

			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			if ( '' !== $deps_after ) echo $deps_after;
		}
	}
}