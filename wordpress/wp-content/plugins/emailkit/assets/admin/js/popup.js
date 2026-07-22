jQuery(document).ready(function ($) {
    'use strict';

    //Getting the localize script data
    var {emailkit_pro_status} = emailkit;

    // Frequently used elements
    var emailkitTemplateLists = $('.emailkit-template-item');
    var emailTypeDropdown = $('#emailkit-add-new-form-model__form-type');
    var templateTypeDropdown = $('#emailkit-add-new-email__template-type');
    let emailkitWrapper = jQuery('.emailkit-template-wrapper');
    var form = $('#emailkit-form');
    var notice = $('#emailkit-notice');
    var newFormModal = $('#emailkit_new_form_modal');
    let responseData = '';
    emailkitWrapper.hide();
	// Flag to control form reset
	var resetFormFlag = true;
    // Open Template Create Modalg
    $('.page-title-action').on('click', function (e) {
        e.preventDefault();
        newFormModal.modal('show');
        $('#emailkit-add-new-form-model__form-type').val('wordpress');
        $('#emailkit-add-new-form-model__form-type').trigger('change');
    });

    // Modify URL to go to the emailkit builder
    $('.row-title').each(function (_, item) {
        item.href = item.href.replace(/(action=)[^&]+/g, '$1' + 'emailkit-builder');
    });

   


    // Initialize the Select2 dropdown
    templateTypeDropdown.select2({
        dropdownParent: newFormModal,
        width: '95%',
        placeholder: "Select email type",
        containerCssClass: 'custom-dropdown'
    });


    templateTypeDropdown.on('select2:open', function (e) {
        $('input.select2-search__field').prop('placeholder', 'Search...');
        $('.select2-container').addClass('emailkit-template-type-dropdown');

        let inputField = $('.emailkit-template-type-dropdown .select2-search__field');
        inputField.on('input', function(e) {
            let {value} = e.target || {};
            if(value !== '') {
                let searchList = $('#select2-emailkit-add-new-email__template-type-results li')[0];
                let searchListText = searchList.innerText;
                if(searchListText !== 'Select Template') {
                    $('.select2-container').removeClass('emailkit-disable-first-item');
                }
            } else {
                $('.select2-container').addClass('emailkit-disable-first-item');
            }
        })

        if(emailTypeDropdown.val() == 'woocommerce' || emailTypeDropdown.val() == 'wordpress') $('.select2-container').addClass('emailkit-disable-first-item');
        else $('.select2-container').removeClass('emailkit-disable-first-item');

        setTimeout(function() {
            $('.select2-container--open .select2-search__field').blur();
          }, 0);
      });

      // Remove the custom class when the dropdown is closed
      templateTypeDropdown.on('select2:close', function (e) {
        $('.select2-container').removeClass('emailkit-template-type-dropdown');
      });


    emailTypeDropdown.select2({
        dropdownParent: newFormModal,
        width: '95%',
        placeholder: "Select email type",
        containerCssClass: 'custom-dropdown'
    });


    emailTypeDropdown.on('select2:open', function (e) {
        $('input.select2-search__field').prop('placeholder', 'Search...');
        $('.select2-container').addClass('emailkit-email-type-dropdown');
        setTimeout(function() {
            // Find the search input within the dropdown and blur it
            $('.select2-container--open .select2-search__field').blur();
          }, 0);
      });

      // Remove the custom class when the dropdown is closed
      emailTypeDropdown.on('select2:close', function (e) {
        $('.select2-container').removeClass('emailkit-email-type-dropdown');
      });


    // Validate if the user selects dropdown items
    $('.emailkit-open-new-form-editor-modal').on('click', function (e) {

        let _self = this;
        
        var selectedEmailType = emailTypeDropdown.val();
        var selectedTemplateType = templateTypeDropdown.val();

        if (!selectedEmailType) {
            handleValidationFailure('Please select email type');
            e.preventDefault();
            return;
        }

        if (!selectedTemplateType || selectedTemplateType === 'Select Template') {
            handleValidationFailure('Please select template type');
            e.preventDefault();
            return;
        }

        e.preventDefault();
        
        // create-from-saved-template
        var url = $(this).attr('resturl');
        var editAction = $('#emailkit-add-new-form-model__form-type').val().trim();
        url += editAction !== 'saved-templates'? "template-data/" : "create-from-saved-template/";
        
        var emailkitProStatus = checkEmailKitProStatus();
        
        // show popup for pro
        if(  ('saved-templates' == editAction) && !emailkit_pro_status){
            return false;
        }
        jQuery(this).addClass('emailkit-slider-loader');
    
            $.ajax({
                url: url,
                type: 'post',
                data: form.serialize(),
                headers: {
                    'X-WP-Nonce': emailTypeDropdown.data('nonce'),
                },
                dataType: 'json',
                success: function (output) {
                    handleAjaxSuccess(output);
                },
                
                beforeSend: function () {
                    // $('.emailkit-open-new-form-editor-modal').attr('disabled',true);
                },
                complete: function (jqXHR, textStatus) {
                    // $('.emailkit-open-new-form-editor-modal').attr('disabled',false);
                    jQuery(_self).remove('emailkit-slider-loader');
    
    
                    if (jqXHR.status === 404) {
                        // $('#emailkitproOverlay').fadeIn();
                        // $('#emailkitproOverlay .content').html('Active EmailKit Pro');
                        jQuery('.emailkit-pro-alert-msg-wrapper').show();
                        jQuery('.emailkit-saved-template-alert-msg').hide();
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    jQuery(_self).remove('emailkit-slider-loader');
                    console.log('Status Text: ' + textStatus);
                    console.log('Error Thrown: ' + errorThrown);
                    // $('.emailkit-open-new-form-editor-modal').attr('disabled',false);
                    $('#emailkitproOverlay .content').html('Something went wrong');
                }
            });
        
    });

    /**
     * Checking EmailKit Pro Status
     */
    function checkEmailKitProStatus(){
        return window.emailkit.emailkit_pro_status.trim() === 'active' ? true : false;
    }

     // Handle the "Buy Pro" action
     $('#buyProBtn').on('click', function() {
        closeProNotice(); // close popup and go to buy
        window.open("https://wpmet.com/")
        return false;
    });

    // Handle the "Close" button click
    $('#closeProBtn').on('click', function() {
        closeProNotice();
    });

    // Close the pro notice on focusout
    $(document).on('click', function(event) {
        if (!$(event.target).closest('.pro-notice').length) {
            closeProNotice();
        }
    });

    function closeProNotice() {
        $('#emailkitproOverlay').fadeOut();
    }

    // Close popup on click close
    $('.emailkit-add-new-form-modal-close-btn').on('click', function () {
        deleteTemplatePopup.hide();
        resetFormAndSelect2();
        $('.emailkit-template-item').css('display', 'block'); // visible all templates items 
    });
   

    // Get email template type on change
    emailTypeDropdown.on('change', function () {
        var emailType = emailTypeDropdown.val();
        templateTypeDropdown.empty();
        updateTemplateDropdown();
        emailkitEmailFilter(emailType);
    });
    
    // Email template type change
    templateTypeDropdown.on('change', function () {
        resetFormFlag = false; // Set the flag to false to prevent form reset
        var templateType = templateTypeDropdown.val();
        var emailType = emailTypeDropdown.val();
        if(emailType == 'saved-templates'){
            let selectedTemplateType = jQuery(this).find('option:selected').text();
            jQuery('.emailkit-saved-template-name').text(selectedTemplateType);
            jQuery('.emailkit-template-delete-btn-confirm').attr('postId', templateType);
        }
        
        emailkitTemplateFilter(templateType, emailType);
        resetFormFlag = true; // Set the flag back to true after handling the change event
    });


    /**
     * @description - show delete saved templates popup
     */

    let deleteSavedTemplateBtn = jQuery('.emailkit-saved-template-delete');
    let deleteTemplatePopup = jQuery('.emailkit-template-delete-popover');
    let closeDeleteTemplatePopup = jQuery('.emailkit-template-delete-btn-cancel');


    //Show popup when delete button is clicked ref- https://prnt.sc/RSZCXUn1kTPl
    if(deleteSavedTemplateBtn.length > 0){
        deleteSavedTemplateBtn.on('click', function(e){
            e.preventDefault();
            deleteTemplatePopup.show();
        })
    }

    if(closeDeleteTemplatePopup.length > 0){
        closeDeleteTemplatePopup.on('click', function(e){
            e.preventDefault();
            deleteTemplatePopup.hide();
        })
    }

    //Close the popover when clicked outside
    jQuery(document).on('mouseup', function(e){
        if(!deleteTemplatePopup.is(e.target) && deleteTemplatePopup.has(e.target).length === 0){
            deleteTemplatePopup.hide();
        }
    })



    /**
     * @description - handling Saved Template Delete feature.
     */

   if(jQuery('.emailkit-template-delete-btn-confirm').length > 0){
        jQuery('.emailkit-template-delete-btn-confirm').on('click', function(e){
            e.preventDefault();
            let postId = jQuery(this).attr('postid');
            let postText = jQuery(this).attr('posttext')


            $.ajax( {
                url: emailkit?.rest_url + `delete-saved-template/${postId}`,
                type: 'delete',
                headers: {
                    'X-WP-Nonce': emailkit.rest_nonce,
                },
                dataType: 'json',
                success: function( response ) {
                    emailTypeDropdown.val('saved-templates').trigger('change');
                    deleteTemplatePopup.hide();
                    jQuery('.emailkit-template-delete-success-notification').show();
                    setTimeout(() => {
                        jQuery('.emailkit-template-delete-success-notification').hide();
                    }, 2000);
                },
                error: function(error){
                    console.log(error);
                    deleteTemplatePopup.hide();
                }
            } );

        });
    }
    // Function to handle validation failure
    function handleValidationFailure(message) {
        showNotice(message);
    }

    // Function to handle AJAX success
    function handleAjaxSuccess(output) {
        if (localStorage.getItem('editorState')) {
            localStorage.removeItem('editorState');
        }
        window.location.href = output.data.builder_url;
        $('#message').css('display', 'block');
    }

    // Function to show notice
    function showNotice(message) {
        notice.text(message);
        notice.css('background', '#d63638');
        notice.fadeIn().delay(1000).slideUp();
    }

    // Function to reset form
    function resetFormAndSelect2() {
        form[0].reset();
        templateTypeDropdown.empty().select2({
            dropdownParent: newFormModal,
            width: '95%',
            placeholder: "Select template",
            data: [{ id: 'Select Template', text: 'Select Template' }],
        });
    }

        /**
     * Function to filter emails based on the dropdownEmailType.
     *
     * @param {type} dropdownEmailType - the type of email to filter
     * @return {type} - no explicit return value
     */
    function emailkitEmailFilter(dropdownEmailType) {
        

        if(dropdownEmailType == 'saved-templates'){

            if(!emailkit_pro_status){
                jQuery('.emailkit-pro-msg-title').text('Almost There!');
                jQuery('.emailkit-pro-msg-content').text('We’ve kept your template safe. Go Pro and keep creating!');
                jQuery('.emailkit-pro-alert-msg-wrapper').show();
                jQuery('.emailkit-blank-template').hide();

                 //disabling the edit with emailkit btn if pro is not active
                $('#editWithEmailkit').prop('disabled', true);
                jQuery('.emailkit-edit-template-btn').addClass('emailkit-pro-inactive');
    

            } else if(emailkit_pro_status){

                jQuery('.emailkit-edit-template-btn').prop('disabled',false);
                jQuery('.emailkit-edit-template-btn').removeClass('emailkit-pro-inactive');

                jQuery('.emailkit-saved-template-alert-msg').show();
                jQuery('.emailkit-blank-template').hide();
            }
            jQuery('.emailkit-select-template-type-msg').hide();
            
        } else {
            jQuery('.emailkit-edit-template-btn').prop('disabled',false);
            jQuery('.emailkit-edit-template-btn').removeClass('emailkit-pro-inactive');
            jQuery('.emailkit-pro-alert-msg-wrapper').hide();
            jQuery('.emailkit-saved-template-alert-msg').hide();
            jQuery('.emailkit-blank-template').show();
            emailkitTemplateLists.each(function (_, value) {
                var currentTemplate = $(value);
                currentTemplate.css('display', dropdownEmailType !== currentTemplate.data('mail-type') ? 'none' : 'block');
            });
        }
    }

    /**
     * A function to filter emailkit templates based on dropdown selection.
     *
     * @param {type} dropdownTemplateType - description of parameter
     * @param {type} emailType - description of parameter
     * @return {void} 
     */
    function emailkitTemplateFilter(dropdownTemplateType, emailType) {

        if( emailType == 'metform' && dropdownTemplateType == 'more-forms'){
            jQuery('.emailkit-blank-template').hide();
            jQuery('.emailkit-edit-template-btn').prop('disabled',true);
            jQuery('.emailkit-pro-msg-title').text('Only One Step Away!');
            jQuery('.emailkit-pro-msg-content').text('Your MetForm user confirmation email templates are waiting for you. Upgrade and start creating!');
            jQuery('.emailkit-pro-alert-msg-wrapper').show();
            jQuery('.emailkit-pro-alert-msg-wrapper').css('height', 'fit-content');
        }else if( emailType != 'saved-templates' && dropdownTemplateType != 'more-forms' ){
            jQuery('.emailkit-blank-template').show();
            jQuery('.emailkit-edit-template-btn').prop('disabled',false);
            jQuery('.emailkit-pro-alert-msg-wrapper').hide();
            jQuery('.emailkit-pro-alert-msg-wrapper').css('height', 'unset');
        }
        

        jQuery('.emailkit-template-loader-wrapper').show();
        jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'hidden');
        
        if('saved-templates' == emailType){
             $('.emailkit-templates-list').hide()
            filterSaveAsTemplate(dropdownTemplateType, emailType);
        }


        var emailkitTemplateLists = $('.emailkit-template-item');
       
        if (dropdownTemplateType.trim() === 'Select Template') {
            jQuery('.emailkit-template-loader-wrapper').hide();
            jQuery('.emailkit-add-new-form-model-contents').css('overflow', 'hidden');
            jQuery('.emailkit-select-template-type-msg').show();
            jQuery('.emailkit-templates-list').hide();
            emailkitTemplateLists.css('display', 'block');
            return;
        } else {
            jQuery('.emailkit-select-template-type-msg').hide();
            jQuery('.emailkit-templates-list').show();
        }

            emailkitTemplateLists.each(function (_, value) {
                var currentTemplate = $(value);
               
                currentTemplate.css('display', dropdownTemplateType.trim() === currentTemplate.data('template-type').trim() ? 'block' : 'none');
            });
            jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'scroll');
            jQuery('.emailkit-template-loader-wrapper').hide();
    }

    function disableEnableEmailkitBtn(el, value) {
        
        if(emailkit_pro_status){
            jQuery(el).prop('disabled', value);
        } else if(!emailkit_pro_status){
            jQuery(el).prop('disabled', value);
        }
        
    }

        /**
     * Function for filtering saved templates.
     *
     * @param {string} template_id - the ID of the template
     * @param {string} emailType - the type of email
     * @return {json} the response from the AJAX call
     */
    function filterSaveAsTemplate(template_id, emailType){
        jQuery('.emailkit-template-loader-wrapper').show();
        jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'hidden');
        $.ajax( {
			url: window.ajaxurl,
			type: 'post',
			data: {template_id:template_id,email_type:emailType, action: 'emailkit_filter_save_as_template',  nonce: emailkit.nonce},
			dataType: 'json',
			success: function( response ) {
                jQuery('.emailkit-template-loader-wrapper').hide();
                jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'scroll');
                if(response.data.dependency_status === false){
                    $('.emailkit-open-new-form-editor-modal').attr('disabled',true);
                    $('.emailkit-open-new-form-editor-modal').addClass('emailkit-pro-inactive');
                    // $('.emailkit-open-new-form-editor-modal').css('opacity','.5');
                    $('.emailkit-templates-list').hide()
                    emailkitWrapper.show();
                    emailkitWrapper.html("<div><br>" +
                    '<p>Looks like you\'ve forgot to <br><a class="emailkit_missing_plugin" target="_blank" href="'+response.data.need_plugin.url+'">'
                    
                    +response.data.need_plugin.label+` <span class="dashicons dashicons-admin-plugins"></span>
                `+"</a>"+
                    "</p></div>")
                }else{
                    if(emailkit_pro_status){
                        $('.emailkit-open-new-form-editor-modal').attr('disabled',false);
                    $('.emailkit-open-new-form-editor-modal').removeClass('emailkit-pro-inactive');
                    } else if(!emailkit_pro_status){
                        $('.emailkit-open-new-form-editor-modal').attr('disabled',true);
                        $('.emailkit-open-new-form-editor-modal').addClass('emailkit-pro-inactive');
                    }
                    $('.emailkit-open-new-form-editor-modal').css('opacity','1');
                    $('.emailkit-templates-list').show()
                    emailkitWrapper.hide();
                    $('.emailkit-templates-list .emailkit-template-item').remove()
                }

			},
			error: function(error){
                jQuery('.emailkit-template-loader-wrapper').hide();
                jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'scroll');
				console.log(error);
			}
		} );
    }

    /**
     * Updates the template dropdown based on the selected email type.
     *
     * @param None
     * @return None
     */
    function updateTemplateDropdown() {
        jQuery('.emailkit-template-loader-wrapper').show();

        if(emailTypeDropdown.val().trim() == 'saved-templates'){
            jQuery('.emailkit-templates-list').css('min-height', '250px');
        }

        jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'hidden');
        $.ajax({
            url: emailkit.ajaxurl,
            type: 'post',
            data: {
                action: 'emailkit_get_email_template_type',
                nonce: emailkit.nonce,
                data: emailTypeDropdown.val(),
            },
            dataType: 'json',
            success: function (response) {
                
                jQuery('.emailkit-add-new-form-model-contents').css('overflow-y', 'scroll');
                if(response.data.dependency_status === false){
                   
                   $('.emailkit-open-new-form-editor-modal').attr('disabled',true);
                    $('.emailkit-open-new-form-editor-modal').addClass('emailkit-pro-inactive');
                    // $('.emailkit-open-new-form-editor-modal').css('opacity','.5');
                    $('.emailkit-templates-list').hide()
                    emailkitWrapper.show();
                    emailkitWrapper.html("<div><br>" +
                    '<p>Looks like you\'ve forgot to <br><a class="emailkit_missing_plugin" target="_blank" href="'+response.data.need_plugin.url+'">'
                    
                    +response.data.need_plugin.label+` <span class="dashicons dashicons-admin-plugins"></span>
                `+"</a>"+
                    "</p></div>")
                    // $('.emailkit-template-wrapper').text( response.data.btn )
                }else{
                    $('.emailkit-open-new-form-editor-modal').attr('disabled',false);
                    $('.emailkit-open-new-form-editor-modal').css('opacity','1');
                    $('.emailkit-templates-list').show()
                    emailkitWrapper.hide();
                    var templates = response.data.templates;
                    var data = response.data.template_name;
                    templateTypeDropdown.select2({
                        data: data,
                        width: '95%',
                        dropdownParent: newFormModal,
                    });
                    
                    $('.emailkit-templates-list .emailkit-template-item').remove()
                    $('.emailkit-templates-list').append(...templates);
                        if(response && response?.data?.template_name?.length > 0){
                            templateTypeDropdown.val(response?.data?.template_name[0].id).trigger('change');
                            jQuery('.emailkit-saved-template-name').text(data[0]?.text)
                            jQuery('.emailkit-template-delete-btn-confirm').attr('postId',data[0]?.id);
                            jQuery('.emailkit-template-delete-btn-confirm').attr('postText',data[0]?.text);
                            jQuery('.emailkit-template-not-available').hide();
                            jQuery('.emailkit-edit-template-btn').prop('disabled',false);
                        } else {
                            jQuery('.emailkit-saved-template-info').hide();
                            jQuery('.emailkit-template-not-available').show();
                            jQuery('.emailkit-edit-template-btn').prop('disabled',true);
                        }
                }
                jQuery('.emailkit-template-loader-wrapper').hide();
                if(emailTypeDropdown.val().trim() == 'saved-templates'){
                    jQuery('.emailkit-templates-list').css('min-height', '110px');
                }
            },
            
            error: function (data) {
                console.log('Error: ' + data);
            }
        });
    }


	//Edit popup

	$( '.row-actions .edit a, .emailkit-form-edit-btn, body.post-type-emailkit-form a.row-title' ).on( 'click', function( e ) {
		e.preventDefault();
		var id = 0;
		var modal = $( '#emailkit_form_modal' );
		$('.emailkit_update_inputs .update_template_name').val('')

		id = (new URL($(this).attr('href')).searchParams.get('post'));

		modal.modal( 'show' );

		$('.emailkit_update_inputs #template_id').val(id)

		$.ajax( {
			url: window.ajaxurl,
			type: 'post',
			data: {ID:id, action: 'emailkit_template_data',  nonce: emailkit.nonce},
			dataType: 'json',
			success: function( response ) {

               $('.emailkit_update_inputs .update_template_name').val(response.data)

			},
			error: function(error){
				console.log(error);
			}
		} );

	} );

	$( '.emailkit_update_template' ).on( 'click', function( e ) {
		e.preventDefault();
		var id = null;
		var title = null;
		var actionType = null;
		var modal = $( '#emailkit_form_modal' );
		actionType = $(e.target).attr('data-action-type')
		id = $('.emailkit_update_inputs #template_id').val();
		title = $('.emailkit_update_inputs .update_template_name').val();

		if(title.trim() == ''){
			alert('Please Give a title')
			return false;
		}

		$.ajax( {
			url: window.ajaxurl,
			type: 'post',
			data: {id:id, title:title, action_type:actionType, action:'emailkit_update_template_data',  nonce: emailkit.nonce},
			dataType: 'json',
			success: function( response ) {

				if(response.data.builder_url){
					location.href = response.data.builder_url;
				}else{
					$('.update_close_icon').click()
					window.location.reload();
				}
			},
			error: function(error){
				console.log(error);
			}
		} );

	} );

});