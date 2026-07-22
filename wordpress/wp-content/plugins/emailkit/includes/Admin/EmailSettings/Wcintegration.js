jQuery(document).ready(function($) {

    function disableBtn(el, exceptEl = '', isTrue = false) {
        if (exceptEl !== "") {
            jQuery(el).not(exceptEl).each((index, item) => {
                jQuery(item).prop('disabled', isTrue);
            })
        } else {
            jQuery(el).each((index, item) => {
                jQuery(item).prop('disabled', isTrue);
            })
        }
    }

    $('.emailkit-edit-button').on('click', function(e) {
        e.preventDefault();
        let _self = this;

        disableBtn('.emailkit-woocom-btn', _self, true);

		var builderUrl = $(this).attr('href');

		if (builderUrl.trim() !=='') {
            window.open(builderUrl, '_blank');
            disableBtn('.emailkit-woocom-btn', "", false);
			return false;
		}

        jQuery(this).addClass('emailkit-slider-loader');

        var editorTemplateUrl = $(this).data('editor-template-url');
        var emailType = $(this).data('emailkit-email-type');
        var templateType = $(this).data('emailkit-template-type');
        var templateTitle = $(this).data('emailkit-template-title'); 
        var templateStatus = 'active'; 

        // Make an AJAX request to the REST API endpoint
        $.ajax({
            url: woocommerce.rest_url + 'template-data',
            method: 'POST',
            headers: {
                'X-WP-Nonce': woocommerce.rest_nonce,
            },
            data: {
                'emailkit-editor-template': editorTemplateUrl,
                'emailkit_email_type': emailType,
                'emailkit_template_type': templateType,
                'emailkit_template_title': templateTitle,
                'emailkit_template_status': templateStatus
            },
            success: function(response) {
                window.open(response.data.builder_url, '_blank');
                disableBtn('.emailkit-woocom-btn', "", false);
                jQuery(_self).removeClass('emailkit-slider-loader');
            },
            error: function(error) {
                console.error(error);
                disableBtn('.emailkit-woocom-btn', "", false);
                jQuery(_self).removeClass('emailkit-slider-loader');
            }
        });

        
    });
});