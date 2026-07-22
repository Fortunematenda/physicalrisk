<?php

namespace Elementor;

defined('ABSPATH') || exit;

class ShopEngine_Call_For_Price extends \ShopEngine\Base\Widget
{

	public function config()
	{
		return new ShopEngine_Call_For_Price_Config();
	}

	protected function register_controls()
	{

		$this->start_controls_section(
			'shopengine_section_product_call_for_price',
			array(
				'label' => esc_html__('Call for Price', 'shopengine'),
				'tab'   => Controls_Manager::TAB_CONTENT,
			)
		);

		$this->add_control(
			'shopengine_call_for_price_btn_text',
			[
				'label'       => esc_html__('Button Text', 'shopengine'),
				'type'        => Controls_Manager::TEXT,
				'default'     => 'Call for Price',
				'frontend_available' => true,
			]
		);

		$this->add_control(
			'shopengine_call_for_price_btn_phone_number',
			[
				'label'       => esc_html__('Button Phone Number', 'shopengine'),
				'type'        => Controls_Manager::TEXT,
				'default'     => '123-456-789',
				'frontend_available' => true,
			]
		);

		$this->end_controls_section();

		/*
        * Style Tab - Call for price
        */
		$this->start_controls_section(
			'shopengine_section_product_call_for_price_style',
			array(
				'label' => esc_html__('Button Style', 'shopengine'),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'           => 'shopengine_product_call_for_price_typography',
				'label'          => esc_html__('Typography', 'shopengine'),
				'selector'       => '{{WRAPPER}} .shopengine-call-for-price-btn',
				'exclude'        => ['text_decoration'],
				'fields_options' => [
					'typography'     => [
						'default' => 'custom',
					],
					'font_weight'    => [
						'default' => '600',
					],
					'font_size'      => [
						'label'      => esc_html__('Font Size (px)', 'shopengine'),
						'default'    => [
							'size' => '15',
							'unit' => 'px'
						],
						'size_units' => ['px']
					],
					'text_transform' => [
						'default' => 'uppercase',
					],
					'line_height'    => [
						'label'      => esc_html__('Line Height (px)', 'shopengine'),
						'default'    => [
							'size' => '18',
							'unit' => 'px'
						],
						'size_units' => ['px'],
						'tablet_default' => [
							'unit' => 'px',
						],
						'mobile_default' => [
							'unit' => 'px',
						],
						'selectors'  => [
							'{{WRAPPER}} .shopengine-call-for-price-btn' => 'line-height: {{SIZE}}{{UNIT}};',
						],
					],
				],
			)
		);

		$this->start_controls_tabs('shopengine_product_call_for_price_style_tabs');

		$this->start_controls_tab(
			'shopengine_product_call_for_price_style_normal',
			[
				'label' => esc_html__('Normal', 'shopengine'),
			]
		);

		$this->add_control(
			'shopengine_product_call_for_price_text_color_normal',
			[
				'label'     => esc_html__('Color', 'shopengine'),
				'type'      => Controls_Manager::COLOR,
				'alpha'		=> false,
				'default'   => '#FFFFFF',
				'selectors' => [
					'{{WRAPPER}} .shopengine-call-for-price-btn' => 'color: {{VALUE}};',
				],
			]
		);

		$this->add_control(
			'shopengine_product_call_for_price_bg_color_normal',
			[
				'label'     => esc_html__('Background Color', 'shopengine'),
				'type'      => Controls_Manager::COLOR,
				'alpha'		=> false,
				'default'   => '#101010',
				'selectors' => [
					'{{WRAPPER}} .shopengine-call-for-price-btn' => 'background-color: {{VALUE}};',
				],
			]
		);

		$this->end_controls_tab();

		$this->start_controls_tab(
			'shopengine_product_call_for_price_style_hover',
			[
				'label' => esc_html__('Hover', 'shopengine'),
			]
		);

		$this->add_control(
			'shopengine_product_call_for_price_text_color_hover',
			[
				'label'     => esc_html__('Color', 'shopengine'),
				'type'      => Controls_Manager::COLOR,
				'alpha'		=> false,
				'default'   => '#FFFFFF',
				'selectors' => [
					'{{WRAPPER}} .shopengine-call-for-price-btn:hover' => 'color: {{VALUE}};',
				],
			]
		);

		$this->add_control(
			'shopengine_product_call_for_price_bg_color_hover',
			[
				'label'     => esc_html__('Background Color', 'shopengine'),
				'type'      => Controls_Manager::COLOR,
				'alpha'		=> false,
				'default'   => '#312b2b',
				'selectors' => [
					'{{WRAPPER}} .shopengine-call-for-price-btn:hover' => 'background-color: {{VALUE}};',
				],
			]
		);

		$this->add_control(
			'shopengine_product_call_for_price_border_color_hover',
			[
				'label'     => esc_html__('Border Color', 'shopengine'),
				'type'      => Controls_Manager::COLOR,
				'alpha'		=> false,
				'default'   => '#312b2b',
				'selectors' => [
					'{{WRAPPER}} .shopengine-call-for-price-btn:hover' => 'border-color: {{VALUE}};',
				],
			]
		);

		$this->end_controls_tab();
		$this->end_controls_tabs();

		$this->add_group_control(
			Group_Control_Border::get_type(),
			[
				'name'           => 'shopengine_product_call_for_price_border',
				'selector'       => '{{WRAPPER}} .shopengine-call-for-price-btn',
				'size_units'     => ['px'],
				'fields_options' => [
					'border' => [
						'default' => 'solid',
					],
					'width'  => [
						'default' => [
							'top'      => '1',
							'right'    => '1',
							'bottom'   => '1',
							'left'     => '1',
							'isLinked' => true,
						],
						'selectors' => [
							'{{WRAPPER}} .shopengine-call-for-price-btn' => 'border-width: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
							'.rtl {{WRAPPER}} .shopengine-call-for-price-btn' => 'border-width: {{TOP}}{{UNIT}} {{LEFT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{RIGHT}}{{UNIT}};',
						]
					],
					'color'  => [
						'default' => '#101010',
						'alpha'		=> false,
					]
				],
				'separator'  => 'before',
			]
		);

		$this->add_control(
			'shopengine_product_call_for_price_border_radius',
			[
				'label'      => esc_html__('Border Radius (px)', 'shopengine'),
				'type'       => Controls_Manager::DIMENSIONS,
				'default'    => [
					'top'      => '5',
					'right'    => '5',
					'bottom'   => '5',
					'left'     => '5',
					'unit'     => 'px',
					'isLinked' => true,
				],
				'size_units' => ['px'],
				'selectors'  => [
					'{{WRAPPER}} .shopengine-call-for-price-btn' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
					'.rtl {{WRAPPER}} .shopengine-call-for-price-btn' => 'border-radius: {{TOP}}{{UNIT}} {{LEFT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{RIGHT}}{{UNIT}};',
				],
			]
		);

		$this->add_responsive_control(
			'shopengine_product_call_for_price_padding',
			[
				'label'      => esc_html__('Padding (px)', 'shopengine'),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => ['px'],
				'default'    => [
					'top'      => '12',
					'right'    => '25',
					'bottom'   => '12',
					'left'     => '25',
					'unit'     => 'px',
					'isLinked' => false,
				],
				'selectors'  => [
					'{{WRAPPER}} .shopengine-call-for-price-btn' 	  => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
					'.rtl {{WRAPPER}} .shopengine-call-for-price-btn' => 'padding: {{TOP}}{{UNIT}} {{LEFT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{RIGHT}}{{UNIT}};',
				],
				'separator'  => 'before',
			]
		);

		$this->add_responsive_control(
			'shopengine_product_call_for_price_margin',
			[
				'label'      => esc_html__('Margin (px)', 'shopengine'),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => ['px'],
				'default'    => [
					'top'      => '0',
					'right'    => '10',
					'bottom'   => '0',
					'left'     => '0',
					'unit'     => 'px',
					'isLinked' => false,
				],
				'selectors'  => [
					'{{WRAPPER}} .shopengine-call-for-price-btn' => 'margin: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
					'.rtl {{WRAPPER}} .shopengine-call-for-price-btn' => 'margin: {{TOP}}{{UNIT}} {{LEFT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{RIGHT}}{{UNIT}};',
				],
				'separator'  => 'before',
			]
		);

		$this->end_controls_section();
	}

	protected function screen()
	{

		$settings = $this->get_settings_for_display();

		$btn_text = !empty($settings['shopengine_call_for_price_btn_text']) ? esc_html($settings['shopengine_call_for_price_btn_text']) : 'Call for Price';
		$phone_number = !empty($settings['shopengine_call_for_price_btn_phone_number']) ? esc_attr($settings['shopengine_call_for_price_btn_phone_number']) : '';

		?>
			<div class="shopengine-call-for-prie"><a href="tel:<?php echo esc_html($phone_number); ?>" class="shopengine-call-for-price-btn"><?php echo esc_html($btn_text) ?></a></div>
		<?php
	}
}
