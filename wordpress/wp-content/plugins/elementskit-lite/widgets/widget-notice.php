<?php 
namespace ElementsKit_Lite\Widgets;
defined( 'ABSPATH' ) || exit;

trait Widget_Notice{
    /**
     * Adding Go Premium message to all widgets
     *
     * @since 1.4.2
     */
    public function insert_pro_message()
    {
        if(\ElementsKit_Lite::package_type() != 'pro'){
            $this->start_controls_section(
                'ekit_section_pro',
                [
                    'label' => __('Go Premium for More Features', 'elementskit-lite'),
                ]
            );

            $this->add_control(
                'ekit_control_get_pro',
                [
                    'label' => __('Unlock more possibilities', 'elementskit-lite'),
                    'type' => \Elementor\Controls_Manager::CHOOSE,
                    'options' => [
                        '1' => [
                            'title' => '',
                            'icon' => 'fa fa-unlock-alt',
                        ],
                    ],
                    'default' => '1',
                    'toggle'    => false,
                    'description' => '<span class="ekit-widget-pro-feature">' . sprintf(
                        /* translators: 1: opening <a> tag, 2: closing </a> tag */
                        esc_html__( 'Get the %1$s Pro version %2$s for more awesome elements and powerful modules.', 'elementskit-lite' ),
                        '<a href="' . esc_url( 'https://wpmet.com/elementskit-pricing' ) . '" target="_blank" rel="noopener noreferrer">',
                        '</a>'
                    ) . '</span>',
                ]
            );

            $this->end_controls_section();
        }
    }
}
