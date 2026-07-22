<?php

namespace Gutenkit\Config;

defined("ABSPATH") || exit;

class PostMetaList
{

    use \Gutenkit\Traits\Singleton;

    private static $full_list   = array();

    /**
     * Get the list
     * 
     * @since 1.0.0
     * @return array 
     */
    public static function get_list()
    {
        // Ensure the list is populated
        if (empty(self::$full_list)) {
            self::set_list();
        }

        // Return the populated list
        return apply_filters("gutenkit/post-meta/list", self::$full_list);
    }

    /**
     * Generate properties for a device
     * 
     * @return array
     */
    private static function generate_device_properties()
    {
        return [
            "type" => "object",
            "properties" => [
                "top" => [
                    "type" => "string",
                ],
                "bottom" => [
                    "type" => "string",
                ],
                "left" => [
                    "type" => "string",
                ],
                "right" => [
                    "type" => "string",
                ]
            ]
        ];
    }

    private static function generate_device_properties_object($condition)
    {
        if ($condition == 'forSliders') {
            return [
                "type" => "object",
                "properties" => [
                    "size" => [
                        "type" => "number",
                        "default" => 0
                    ],
                    "unit" => [
                        "type" => "string",
                        "default" => "%"
                    ]
                ]
            ];
        } else if ($condition == 'forBoxValues') {
            return [
                "type" => "object",
                "properties" => [
                    "top" => [
                        "type" => "string",
                    ],
                    "bottom" => [
                        "type" => "string",
                    ],
                    "left" => [
                        "type" => "string",
                    ],
                    "right" => [
                        "type" => "string",
                    ]
                ]
            ];
        }
    }



    /**
     * Populate the list
     * 
     * @since 1.0.0
     * @return array
     */
    public static function set_list()
    {
        $device_properties = self::generate_device_properties();

        $lists = [
            "postBodyCss" => [ // post meta key
                "post_type" => "", // post type name, empty for all
                "args" => [ // pass arguments
                    "type"              => "string", // specify the type as string
                    "show_in_rest"      => true, // enable REST API support
                    "single"            => true, // single meta value
                    "sanitize_callback" => 'wp_strip_all_tags', // sanitize input to prevent XSS
                ]
            ],
            "postBodyMargin" => [ // post meta key
                "post_type" => "", // post type name put empty for all
                "args" => [ // pass arguments or an empty array
                    "type"         => "object",
                    "show_in_rest" => [ // show in REST API
                        "schema" => [ // schema
                            "type" => "object",
                            "properties" => [
                                "Desktop" => $device_properties,
                                "Tablet" => $device_properties,
                                "Mobile" => $device_properties,
                                "TabletLandscape" => $device_properties,
                                "MobileLandscape" => $device_properties,
                                "Laptop" => $device_properties,
                                "WideScreen" => $device_properties
                            ]
                        ]
                    ],
                    "single" => true,
                ]
            ],
            "postBodyPadding" => [ 
                "post_type" => "", 
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "properties" => [
                                "Desktop" => $device_properties,
                                "Tablet" => $device_properties,
                                "Mobile" => $device_properties,
                                "TabletLandscape" => $device_properties,
                                "MobileLandscape" => $device_properties,
                                "Laptop" => $device_properties,
                                "WideScreen" => $device_properties
                            ]
                        ]
                    ],
                ]
            ],
            "postBodyBackground" => [
                "post_type" => "",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            'additionalProperties' => array(
                                'type' => 'object',
                            ),
                            "properties" => [
                                "backgroundType" => [
                                    "type" => "string",
                                    "enum" => [
                                        "classic",
                                        "gradient",
                                        "image",
                                    ],
                                ],
                                "gradient" => [
                                    "type" => "string"
                                ],
                                "backgroundColor" => [
                                    "type" => "string"
                                ],
                                "backgroundImageSize" => [
                                    "type" => "object",
                                    "properties" => [
                                        "Desktop" => [
                                            "type" => "string"
                                        ],
                                        "Tablet" => [
                                            "type" => "string"
                                        ],
                                        "Mobile" => [
                                            "type" => "string"
                                        ],
                                        "TabletLandscape" => [
                                            "type" => "string"
                                        ],
                                        "MobileLandscape" => [
                                            "type" => "string"
                                        ],
                                        "Laptop" => [
                                            "type" => "string"
                                        ],
                                        "WideScreen" => [
                                            "type" => "string"
                                        ],
                                    ]
                                ],
                                "backgroundVideo" => [
                                    "type" => "string"
                                ],
                                "backgroundPosition" => [
                                    "type" => "object",
                                    "properties" => [
                                        "Desktop" => [
                                            "type" => "string"
                                        ],
                                        "Tablet" => [
                                            "type" => "string"
                                        ],
                                        "Mobile" => [
                                            "type" => "string"
                                        ],
                                        "TabletLandscape" => [
                                            "type" => "string"
                                        ],
                                        "MobileLandscape" => [
                                            "type" => "string"
                                        ],
                                        "Laptop" => [
                                            "type" => "string"
                                        ],
                                        "WideScreen" => [
                                            "type" => "string"
                                        ],
                                    ]
                                ],
                                "backgroundAttachment" => [
                                    "type" => "string"
                                ],
                                "backgroundRepeat" => [
                                    "type" => "string"
                                ],
                                "backgroundSize" => [
                                    "type" => "string"
                                ],
                                "customSize" => [
                                    "type" => "object",
                                    "properties" => [
                                        "Desktop" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Tablet" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Mobile" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "TabletLandscape" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "MobileLandscape" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Laptop" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "WideScreen" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                    ]
                                ],
                                "customPositionX" => [
                                    "type" => "object",
                                    "properties" => [
                                        "Desktop" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Tablet" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Mobile" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "TabletLandscape" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "MobileLandscape" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Laptop" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "WideScreen" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                    ]
                                ],
                                "customPositionY" => [
                                    "type" => "object",
                                    "properties" => [
                                        "Desktop" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Tablet" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Mobile" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "TabletLandscape" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "MobileLandscape" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "Laptop" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                        "WideScreen" => [
                                            "type" => "object",
                                            "properties" => [
                                                "size" => [
                                                    "type" => "number"
                                                ],
                                                "unit" => [
                                                    "type" => "string"
                                                ]
                                            ]
                                        ],
                                    ]
                                ],
                            ]
                        ]
                    ],
                    "single" => true,
                    "default" => [
                        "backgroundType" => "classic",
                        "gradient" => "",
                    ]
                ]
            ],
            // Global Class Manager Styles
            "globalClassManagerStyle" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"         => "object",
                    "show_in_rest" => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true,
                ]
            ],
            "globalClassManagerTypography" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"         => "object",
                    "show_in_rest" => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true,
                ]
            ],
            "globalClassManagerTypographyTextAlignmentDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTypographyTextAlignmentTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTypographyTextAlignmentMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTypographyTextAlignmentTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTypographyTextAlignmentMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTypographyTextAlignmentLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTypographyTextAlignmentWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true
                ]
            ],
            "globalClassManagerTextShadow" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ],
            ],
            "globalClassManagerTextColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerLinkColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerFillColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerStrokeColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerStrokeWidth" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema"    => [
                            "type"  => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerStrokeDasharray" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema"    => [
                            "type"  => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerStrokeOpacity" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema"    => [
                            "type"  => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerStrokeLinecap" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerStrokeLinejoin" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerBackground" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],

            // Spacing Controls
            "globalClassManagerPaddingDesktop" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerPaddingTablet" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerPaddingMobile" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerPaddingTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerPaddingMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerPaddingLaptop" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerPaddingWideScreen" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginDesktop" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginTablet" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginMobile" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginLaptop" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerMarginWideScreen" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "default"       => [ "top" => "0", "right" => "0", "bottom" => "0", "left" => "0" ],
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],

            "globalClassManagerOverflowXStyle" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "string",
                    "show_in_rest"  => true,
                    "single" => true
                ]
            ],
            "globalClassManagerOverflowYStyle" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "string",
                    "show_in_rest"  => true,
                    "single" => true
                ]
            ],
            "globalClassManagerWhiteSpace" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "string",
                    "show_in_rest"  => true,
                    "single" => true
                ]
            ],

            "globalClassManagerBorderDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true,
                        ],
                    ],
                ],
            ],

            "globalClassManagerBorderRadiusDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderRadiusTablet" => [
                "post_type" => "class-manager",
               "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderRadiusMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderRadiusTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderRadiusMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderRadiusLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "globalClassManagerBorderRadiusWideScreen" => [
                "post_type" => "class-manager",
               "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "classManagerBoxShadowColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,   
                    "show_in_rest"  => true,
                ],
            ],
            "classManagerBoxShadowHorizontal" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
           
            "classManagerBoxShadowVertical" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "classManagerBoxShadowBlur" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "classManagerBoxShadowSpread" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ],
            ],
            "classManagerBoxShadowPosition" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
            ],
            "globalClassManagerBoxShadow" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ],
            ],
            // Advanced Tab
            "globalClassManagerAdvancedWidthDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
            ],
            "globalClassManagerAdvancedWidthTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
            ],
            "globalClassManagerAdvancedWidthMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
            ],
            "globalClassManagerAdvancedWidthTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
            ],
            "globalClassManagerAdvancedWidthMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerAdvancedWidthLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "globalClassManagerAdvancedWidthWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],

            "classManagerAdvancedCustomWidthDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomWidthTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomWidthMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomWidthTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomWidthMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomWidthLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomWidthWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMinWidthWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerAdvancedCustomMaxWidthWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerLayoutType" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexDirectionWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexAlignWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexJustifyWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexColumnGapDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexColumnGapTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexColumnGapMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexColumnGapTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexColumnGapMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexColumnGapLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexColumnGapWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexRowGapWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerFlexWrapDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexWrapTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexWrapMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexWrapTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexWrapMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexWrapLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerFlexWrapWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "classManagerGridMinimumColumnWidthDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnWidthTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnWidthMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnWidthTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnWidthMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnWidthLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnWidthWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridMinimumColumnHeightWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"         => "object",
                    "show_in_rest" => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                    "single" => true
                ]
            ],
            "classManagerGridColumnsDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridColumnsTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridColumnsMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridColumnsTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridColumnsMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,   
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerGridColumnsLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerGridColumnsWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridManualRowsDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridManualRowsTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridManualRowsMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridManualRowsTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerGridManualRowsMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,   
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerGridManualRowsLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerGridManualRowsWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "number",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "number",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "globalClassManagerAdvancedPositions" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerVerticalPosition" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],
            "classManagerVerticalPositionOffsetDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerVerticalPositionOffsetTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerVerticalPositionOffsetMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerVerticalPositionOffsetTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                        "type"          => "object",
                        "single"        => true,   
                        "show_in_rest"  => [
                            "schema" => [
                                "type" => "object",
                                "additionalProperties" => true
                            ],
                        ],
                    ]
            ],
            "classManagerVerticalPositionOffsetMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerVerticalPositionOffsetLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerVerticalPositionOffsetWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerHorizontalPosition" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                   "show_in_rest"  => true,
                ]
            ],

            "classManagerHorizontalPositionOffsetDesktop" => [
                "post_type" => "class-manager",
               "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerHorizontalPositionOffsetTablet" => [
                "post_type" => "class-manager",
               "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerHorizontalPositionOffsetMobile" => [
                "post_type" => "class-manager",
                "args" => [
                        "type"          => "object",
                        "single"        => true,   
                        "show_in_rest"  => [
                            "schema" => [
                                "type" => "object",
                                "additionalProperties" => true
                            ],
                        ],
                    ]
            ],
            "classManagerHorizontalPositionOffsetTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerHorizontalPositionOffsetMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerHorizontalPositionOffsetLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerHorizontalPositionOffsetWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,   
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ],
                    ],
                ]
            ],
            "classManagerAdvancedZindexDesktop" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema"    => [
                            "type"  => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerAdvancedZindexTablet" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerAdvancedZindexMobile" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerAdvancedZindexTabletLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerAdvancedZindexMobileLandscape" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema"    => [
                            "type"  => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerAdvancedZindexLaptop" => [
                "post_type" => "class-manager",
                "args" => [
                        "type"          => "object",
                        "single"        => true,
                        "show_in_rest"  => [
                            "schema"    => [
                                "type"  => "object",
                                "additionalProperties" => true
                            ]
                        ],
                    ]
            ],
            "classManagerAdvancedZindexWideScreen" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [
                        "schema" => [
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
            "classManagerCustomCSSSwitch" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "boolean",
                    "default"       => false,
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
                "sanitize_callback" => "sanitize_textarea_field",
            ],
            "classManagerCustomCSS" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ],
                "sanitize_callback" => "sanitize_textarea_field",
            ],

            // Sub Class Manager
            "subClassManagerTextColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "subClassManagerLinkColor" => [
                "post_type" => "class-manager",
                "args" => [
                    "type"          => "string",
                    "single"        => true,
                    "show_in_rest"  => true,
                ]
            ],
            "subClassManagerBackground" => [
                "post_type" => "class-manager",
                "args" => [ 
                    "type"          => "object",
                    "single"        => true,
                    "show_in_rest"  => [ 
                        "schema" => [ 
                            "type" => "object",
                            "additionalProperties" => true
                        ]
                    ],
                ]
            ],
        ];

        // Assign the array to the static property
        self::$full_list = $lists;
    }

    public static function get_full_list() {
        return self::$full_list;
    }
};