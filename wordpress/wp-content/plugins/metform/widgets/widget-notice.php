<?php 
namespace MetForm\Widgets;
defined( 'ABSPATH' ) || exit;

trait Widget_Notice{
    /**
     * Adding Go Pro message to all widgets
     */
    public function insert_pro_message()
    {
        
        if(!class_exists('\MetForm_Pro\Plugin')){
            $this->start_controls_section(
                'ekit_section_pro',
                [
                    'label' => __('Go Pro for More Features', 'metform'),
                ]
            );

            $this->add_control(
                'ekit_control_get_pro',
                [
                    'label' => __('Unlock more possibilities', 'metform'),
                    'type' => \Elementor\Controls_Manager::CHOOSE,
                    'options' => [
                        '1' => [
                            'title' => '',
                            'icon' => 'fa fa-unlock-alt',
                        ],
                    ],
                    'default' => '1',
                    'description' => '<span class="mf-widget-pro-feature"> ' . sprintf(
                        /* translators: %1$s: opening anchor tag for the Pro version link, %2$s: closing anchor tag. */
                        esc_html__('Get the %1$sPro version%2$s for more awesome elements and powerful modules.', 'metform'),
                        '<a href="https://wpmet.com/plugin/metform/pricing/" target="_blank">',
                        '</a>'
                    ) . '</span>',
                ]
            );

            $this->end_controls_section();
        }
    }
}