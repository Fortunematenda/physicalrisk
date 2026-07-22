<?php

namespace Gutenkit\Libs;

defined('ABSPATH') || exit;

use \Gutenkit\Helpers\Utils;

class FontLoadLocally
{
	const FONTS_FOLDER = 'gkit-fonts';
	const GOOGLE_FONTS_API_URL = 'https://www.googleapis.com/webfonts/v1/webfonts';
	const GOOGLE_FONTS_API_KEY = 'AIzaSyAdhJh9b4BpR0cQqIt1uBBeaq2f58Ztd7E';

	/**
	 * Recursively filters blocks for only those with 'gutenkit' in the block name.
	 *
	 * @param array $blocks
	 * @return array
	 */
	public function filter_blocks($blocks = array())
	{
		$filtered_blocks = [];

		foreach ($blocks as $block) {
			if (isset($block['blockName']) && strpos($block['blockName'], 'gutenkit') !== false) {
				$filtered_blocks[] = $block;
			}

			if (!empty($block['innerBlocks'])) {
				$filtered_blocks = array_merge($filtered_blocks, $this->filter_blocks($block['innerBlocks']));
			}
		}

		return $filtered_blocks;
	}

	/**
	 * Downloads and registers fonts locally if missing.
	 *
	 * @param array $fonts
	 */
	public function load_font($fonts)
	{
		if (empty($fonts)) {
			return;
		}

		// Remove duplicate values and sort the arrays
		$fonts = array_map(function($arr) {
			$arr = array_unique($arr);
			sort($arr);
			return $arr;
		}, $fonts);

		$fonts = $this->check_existing_fonts($fonts);

		// Ensure the fonts directory exists
		$upload_dir = wp_upload_dir();
		$fonts_dir = trailingslashit($upload_dir['basedir']) . 'gkit-fonts';
		$font_uri  = trailingslashit($upload_dir['baseurl']) . 'gkit-fonts';

		// Download fonts if the directory does not exist
		if (!is_dir($fonts_dir)) {
			foreach ($fonts as $font => $weights) {
				$this->prepare_font($font, $weights);
			}
		} else {
			foreach ($fonts as $font => $weights) {
				$family_dir = trailingslashit($fonts_dir) . str_replace(' ', '-', strtolower($font));
				foreach ($weights as $weight) {
					$font_weight = in_array($weight, ['normal', '400']) ? 'regular' : $weight;
					$files = glob($family_dir . "/{$font_weight}-*");
					if (!empty($files)) {
						continue; // Font files already exist
					} else {
						// If files do not exist, download the font
						$this->prepare_font($font, [$weight]);
					}
				}
			}
		}

		// Load google fonts inline
		if (!is_dir($fonts_dir)) return;

		// Prepare CSS for the fonts
		$fonts_css = '';
		foreach ($fonts as $font => $weights) {
			$family_dir = $fonts_dir . '/' . str_replace(' ', '-', strtolower($font));

			if (!is_dir($family_dir)) continue;

			foreach ($weights as $weight) {
				$font_weight = in_array($weight, ['normal', '400']) ? 'regular' : $weight;
				$font_files = glob($family_dir . "/{$font_weight}-*.woff2");

				if (empty($font_files)) continue;

				$font_family = ucwords(str_replace('-', ' ', strtolower($font)));
				$font_folder = str_replace(' ', '-', strtolower($font));
				$src = trailingslashit($font_uri) . "$font_folder/" . basename($font_files[0]);

				$fonts_css .= "
					@font-face {
						font-family: '{$font_family}';
						src: url('{$src}') format('woff2');
						font-weight: {$font_weight};
						font-style: normal;
						font-display: swap;
					}
				";
			}
		}

		// Enqueue the fonts CSS
		if (!empty($fonts_css)) {
			$handle = 'gkit-google-fonts-local';
			wp_register_style($handle, false);
			wp_add_inline_style($handle, Utils::cssminifier($fonts_css));
			wp_enqueue_style($handle);
		}
	}

	/**
	 * Loads FSE fonts from the local directory.
	 *
	 * @param array $fonts
	 */
	public function load_fse_font() {
		if(!isset($_REQUEST['canvas']) || !is_admin()) {
			return;
		}

		$upload_dir = wp_upload_dir();
		$fonts_dir  = trailingslashit($upload_dir['basedir']) . 'gkit-fonts/';
		$fonts_url  = trailingslashit($upload_dir['baseurl']) . 'gkit-fonts/';

		if (!is_dir($fonts_dir)) {
			return;
		}

		$font_files = glob($fonts_dir . '*/*.{woff,woff2,ttf,otf,eot}', GLOB_BRACE);

		if (empty($font_files)) {
			return;
		}

		$fonts_css = '';

		foreach ($font_files as $file_path) {
			$relative_path = str_replace($fonts_dir, '', $file_path);
			$font_name     = dirname($relative_path);
			$file_name     = basename($file_path);
			$font_weight   = strtok($file_name, '-');
			$font_weight   = in_array($font_weight, ['regular', 'normal', '400']) ? 'normal' : $font_weight;
			$ext           = pathinfo($file_path, PATHINFO_EXTENSION);
			$font_url      = $fonts_url . $font_name . '/' . $file_name;
			$font_family   = ucwords(str_replace('-', ' ', strtolower($font_name)));

			// You may expand formats as needed
			$format_map = [
				'woff'  => 'woff',
				'woff2' => 'woff2',
				'ttf'   => 'truetype',
				'otf'   => 'opentype',
				'eot'   => 'embedded-opentype',
			];

			$format = $format_map[$ext] ?? 'woff';

			$fonts_css .= "@font-face {
				font-family: '{$font_family}';
				src: url('{$font_url}') format('{$format}');
				font-weight: {$font_weight};
				font-style: normal;
				font-display: swap;
			}\n";
		}

		if (!empty($fonts_css)) {
			$handle = 'gkit-google-fonts-local';
			wp_register_style($handle, false);
			wp_add_inline_style($handle, Utils::cssminifier($fonts_css));
			wp_enqueue_style($handle);
		}
	}

	/**
	 * Retrieves and stores a font from Google Fonts API.
	 *
	 * @param string $font
	 * @param array $weights
	 */
	public function prepare_font($font, $weights)
	{
		$upload_dir = wp_upload_dir();
		$font_dir = trailingslashit($upload_dir['basedir']) . 'gkit-fonts';

		if (!is_dir($font_dir)) {
			wp_mkdir_p($font_dir);
		}

		$font_list = [];

		$font_family_dir = trailingslashit($font_dir) . str_replace(' ', '-', strtolower($font));
		if (!is_dir($font_family_dir)) {
			wp_mkdir_p($font_family_dir);
		}

		$api_url = add_query_arg([
			'key'       => self::GOOGLE_FONTS_API_KEY,
			'capability' => 'WOFF2',
			'family'    => urlencode($font),
		], self::GOOGLE_FONTS_API_URL);

		$response = wp_remote_get($api_url, ['timeout' => 15]);

		if (is_wp_error($response)) {
			error_log('Font API request failed: ' . $response->get_error_message());
			return;
		}

		$body = wp_remote_retrieve_body($response);
		$body = json_decode($body, true);

		if (!empty($body['items'][0])) {
			$font_list[] = $body['items'][0];
		}

		$this->save_font(array_shift($font_list), $weights, $font_dir);
	}

	/**
	 * Saves specific font files to local directory.
	 *
	 * @param array $font
	 * @param array $weights
	 * @param string $font_dir
	 */
	public function save_font($font, $weights, $font_dir)
	{
		global $wp_filesystem;

		if (empty($wp_filesystem)) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}

		$font_family = isset($font['family']) ? sanitize_text_field($font['family']) : '';
		$font_files = $font['files'] ?? [];
		$font_family_dir = trailingslashit($font_dir) . str_replace(' ', '-', strtolower($font_family));

		if (!$wp_filesystem->is_dir($font_family_dir)) {
			wp_mkdir_p($font_family_dir);
		}

		foreach ($weights as $weight) {
			$font_weight = in_array($weight, ['normal', '400']) ? 'regular' : $weight;

			if (!isset($font_files[$font_weight])) {
				continue; // Skip if no file for this weight
			}

			$font_file_url = esc_url_raw($font_files[$font_weight]);
			$font_filename = sanitize_file_name($font_weight . '-' . basename($font_file_url));
			$font_file_path = trailingslashit($font_family_dir) . $font_filename;

			// Skip if the font file already exists
			if ($wp_filesystem->exists($font_file_path)) {
				return;
			}

			$response = wp_remote_get($font_file_url, ['timeout' => 10]);

			if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
				error_log('Failed to download font: ' . $font_file_url);
				return;
			}

			$font_content = wp_remote_retrieve_body($response);

			// Save the font file
			$wp_filesystem->put_contents($font_file_path, $font_content, FS_CHMOD_FILE);
		}
	}

	/**
	 * Prepares a list of fonts to download by checking against existing theme and custom fonts.
	 *
	 * @param array $font_attributes An array of font attributes to process.
	 * @return array List of fonts to download.
	 */
	public function check_existing_fonts($fonts = [])
	{
		$theme_fonts = wp_get_global_settings(['typography', 'fontFamilies']);
		$existing_fonts = [];

		// Build lookup for theme fonts
		if (!empty($theme_fonts['theme'])) {
			foreach ($theme_fonts['theme'] as $theme_font) {
				if (!empty($theme_font['fontFace'])) {
					foreach ($theme_font['fontFace'] as $font_face) {
						if (isset($font_face['fontFamily'], $font_face['fontWeight'])) {
							$existing_fonts[$font_face['fontFamily']][] = $font_face['fontWeight'];
						}
					}
				}
			}
		}

		// Build lookup for custom fonts
		if (!empty($theme_fonts['custom'])) {
			foreach ($theme_fonts['custom'] as $custom_font) {
				if (!empty($custom_font['fontFace'])) {
					foreach ($custom_font['fontFace'] as $font_face) {
						if (isset($font_face['fontFamily'], $font_face['fontWeight'])) {
							// $key = strtolower($font_face['fontFamily']) . '-' . $font_face['fontWeight'];
							// $existing_fonts[$key] = true;
							$existing_fonts[$font_face['fontFamily']][] = $font_face['fontWeight'];
						}
					}
				}
			}
		}

		if(!empty($existing_fonts)) {
			foreach ($fonts as $font => $weights) {
				if (isset($existing_fonts[$font])) {
					$fonts[$font] = array_diff($weights, $existing_fonts[$font]);
				}
			}
		}

		return $fonts;
	}
}
