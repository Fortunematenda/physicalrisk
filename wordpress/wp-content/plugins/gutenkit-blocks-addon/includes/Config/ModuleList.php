<?php

namespace Gutenkit\Config;

defined( 'ABSPATH' ) || exit;
class ModuleList extends \Gutenkit\Core\ConfigList {

	protected $type = 'modules';
	
	protected function set_required_list() {
		$this->required_list = array(
			'icon-pack' => array(
				'slug'          => 'icon-pack',
				'title'         => 'Icon Pack',
				'package'       => 'free',
				'auto_enqueue'  => true,
				'attributes'    => array( 'new' ),
			),
			'page-settings' => array(
				'slug'          => 'page-settings',
				'title'         => 'Page Settings',
				'package'       => 'free',
				'auto_enqueue'  => false,
				'attributes'    => array( 'new' ),
			),
			'breakpoints' => array(
				'slug'          => 'breakpoints',
				'title'         => 'Breakpoints',
				'package'       => 'free',
				'auto_enqueue'  => false,
				'attributes'    => array( 'new' ),
			),
		);
	}

	protected function set_optional_list() {
		$this->optional_list = apply_filters(
			'gutenkit/modules/list',
			array(
				'icon-pack' => array(
					'slug'			=> 'icon-pack',
					'title'			=> 'Icon Pack',
					'package'		=> 'free',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'required'		=> true,
				),
				'copy-paste-style' => array(
					'slug'			=> 'copy-paste-style',
					'title'			=> 'Copy Paste Style',
					'package'		=> 'free',
					'auto_enqueue'	=> true,
					'status'		=> 'active',
				),
				'visibility' => array(
					'slug'			=> 'visibility',
					'title'			=> 'Visibility',
					'package'		=> 'free',
					'auto_enqueue'	=> true,
					'status'		=> 'active',
				),
				'page-settings' => array(
					'slug'			=> 'page-settings',
					'title'			=> 'Page Settings',
					'package'		=> 'free',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'required'		=> true,
				),
				'scrolling-effects' => array(
					'slug'          => 'scrolling-effects',
					'title'         => 'Scrolling Effects (Parallax)',
					'package'       => 'pro',
					'auto_enqueue'  => true,
					'attributes'    => array( 'new' ),
					'status'        => 'active',
				),
				'glass-morphism' => array(
					'slug'			=> 'glass-morphism',
					'title'			=> 'Glass Morphism',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'css-transform' => array(
					'slug'			=> 'css-transform',
					'title'			=> 'CSS Transform',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'advanced-tooltip' => array(
					'slug'			=> 'advanced-tooltip',
					'title'			=> 'Advanced Tooltip',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'one-page-scroll' => array(
					'slug'			=> 'one-page-scroll',
					'title'			=> 'One Page Scroll',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'dynamic-content' => array(
					'slug'			=> 'dynamic-content',
					'title'			=> 'Dynamic Content',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new', 'beta'],
				),
				'sticky' => array(
					'slug'			=> 'sticky',
					'title'			=> 'Sticky',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'entrance-animation' => array(
					'slug'			=> 'entrance-animation',
					'title'			=> 'Entrance Animation',
					'package'		=> 'free',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'mouse-tilt' => array(
					'slug'			=> 'mouse-tilt',
					'title'			=> 'Mouse Tilt',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'mouse-track' => array(
					'slug'			=> 'mouse-track',
					'title'			=> 'Mouse Track',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
				),
				'masking' => array(
					'slug'			=> 'masking',
					'title'			=> 'Masking',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'badge'			=> ['new'],
				),
				'custom-css' => array(
					'slug'			=> 'custom-css',
					'title'			=> 'Custom CSS',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'badge'			=> ['new'],
				),
				'display-conditions' => array(
					'slug'			=> 'display-conditions',
					'title'			=> 'Display Conditions',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'badge'			=> ['new'],
				),
				'smooth-scroll' => array(
					'slug'			=> 'smooth-scroll',
					'title'			=> 'Smooth Scroll',
					'package'		=> 'pro',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'badge'			=> ['new'],
				),
				'interactions' => array(
					'slug'			=> 'interactions',
					'title'			=> 'Interactions',
					'package'		=> 'pro',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'active',
					'badge'			=> ['new'],
				),
				'breakpoints' => array(
					'slug'			=> 'breakpoints',
					'title'			=> 'Breakpoints',
					'package'		=> 'free',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new', 'beta'],
				),
				'particle' => array(
					'slug'			=> 'particle',
					'title'			=> 'Particle',
					'package'		=> 'pro',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new'],
				),
				'scroll-spy' => array(
					'slug'			=> 'scroll-spy',
					'title'			=> 'Scroll Spy',
					'package'		=> 'pro',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new']
				),
				'video-scroller' => array(
					'slug'			=> 'video-scroller',
					'title'			=> 'Video Scroller',
					'package'		=> 'pro',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new']
				),
				'class-manager' => array(
					'slug'			=> 'class-manager',
					'title'			=> 'Class Manager',
					'package'		=> 'free',
					'auto_enqueue'	=> true,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new', 'beta']
				),
				'marquee' => array(
					'slug'			=> 'marquee',
					'title'			=> 'Marquee',
					'package'		=> 'pro',
					'auto_enqueue'	=> false,
					'attributes'	=> array( 'new' ),
					'status'		=> 'inactive',
					'badge'			=> ['new'],
				),
			)
		);
	}
}