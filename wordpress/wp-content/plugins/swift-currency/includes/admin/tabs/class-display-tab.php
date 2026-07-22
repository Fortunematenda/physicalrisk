<?php
/**
 * Display Settings Tab — simplified global settings with rich customization.
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin\Tabs;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Display_Tab {

	private $settings;

	public function __construct( $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Enqueue tab assets.
	 */
	public function enqueue_assets() {
		$style = "
		.sc-dx{max-width:920px;--dx-bg:#f8f9fd;--dx-card:#fff;--dx-border:#e5e7f0;--dx-text:#1a1d2e;--dx-muted:#7d829a;--dx-accent-admin:#2271b1;--dx-r:14px;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif}
		.sc-display-form .submit{padding:0;margin:0}
		.sc-dx-head h2{margin:0 0 4px;font-size:21px;font-weight:700;color:var(--dx-text)}
		.sc-dx-head p{margin:0 0 16px;color:var(--dx-muted);font-size:13.5px}
		.sc-dx-card{background:var(--dx-card);border:1px solid var(--dx-border);border-radius:var(--dx-r);padding:16px 18px;margin-bottom:12px}
		.sc-dx-sec-label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#a0a5bf;margin-bottom:10px}
		.sc-dx-mini-label{display:block;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#b0b5cc;margin-bottom:6px}
		.sc-dx-preview-wrap{border:1px solid var(--dx-border);border-radius:10px;padding:20px;background:#fafbfe;display:flex;justify-content:center;min-height:60px}
		.sc-dx-preview-box{transition:all .2s}
		.sc-dx-style-row{display:flex;gap:6px;flex-wrap:wrap}
		.sc-dx-style-opt{border:1.5px solid var(--dx-border);border-radius:10px;padding:8px;cursor:pointer;background:#fafbfe;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:80px;transition:all .15s}
		.sc-dx-style-opt input{display:none}
		.sc-dx-style-opt.is-active{border-color:var(--dx-accent-admin);background:#f0f6ff;box-shadow:0 0 0 2px rgba(34,113,177,.1)}
		.sc-dx-style-name{font-size:10px;font-weight:600;color:var(--dx-muted)}
		.sc-dx-style-opt.is-active .sc-dx-style-name{color:var(--dx-accent-admin)}
		.sc-dx-style-thumb{width:56px;height:28px;display:flex;align-items:center;justify-content:center}
		.sc-dx-sthumb--pill_dropdown::before{content:'USD ▾';background:var(--dx-accent-admin);color:#fff;font-size:9px;font-weight:700;padding:3px 12px;border-radius:99px}
		.sc-dx-sthumb--list::before{content:'USD\\AEUR\\AGBP';white-space:pre;color:var(--dx-accent-admin);font-size:8px;line-height:1.15;font-weight:600}
		.sc-dx-sthumb--native_select::before{content:'USD ▾';border:1px solid #ccc;color:#333;background:#fafafa;font-size:9px;font-weight:700;padding:3px 7px;border-radius:3px}
		.sc-dx-sthumb--buttons::before{content:'USD  EUR';border:1.5px solid var(--dx-accent-admin);color:var(--dx-accent-admin);font-size:8px;font-weight:700;padding:2px 6px;border-radius:5px}
		.sc-dx-sthumb--segmented::before{content:'USD|EUR';background:#f0eef4;color:var(--dx-accent-admin);font-size:8px;font-weight:700;padding:3px 8px;border-radius:8px}
		.sc-dx-sthumb--stack::before{content:'USD\\A$';white-space:pre;border:1px solid #ddd;color:#333;font-size:8px;line-height:1;font-weight:700;padding:4px}
		.sc-dx-sthumb--glass_float::before{content:'$';background:var(--dx-accent-admin);color:#fff;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center}
		.sc-dx-pills{display:flex;flex-wrap:wrap;gap:5px}
		.sc-dx-pill{border:1px solid var(--dx-border);border-radius:999px;padding:3px 10px;cursor:pointer;background:#fff;transition:all .15s}
		.sc-dx-pill input{display:none}
		.sc-dx-pill span{font-size:11px;color:var(--dx-muted);font-weight:500}
		.sc-dx-pill.is-on{border-color:var(--dx-accent-admin);background:#f0f6ff}
		.sc-dx-pill.is-on span{color:var(--dx-accent-admin);font-weight:600}
		.sc-dx-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
		.sc-dx-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
		.sc-dx-field label{display:block;font-size:11px;color:var(--dx-muted);margin-bottom:4px;font-weight:500}
		.sc-dx-field input[type=\"number\"],.sc-dx-field input[type=\"text\"],.sc-dx-field textarea,.sc-dx-field select{border:1px solid var(--dx-border);border-radius:8px;padding:6px 8px;font-size:12px;min-height:32px;width:100%;box-sizing:border-box;transition:all .2s;background:#fff;color:var(--dx-text)}
		.sc-dx-field input:focus,.sc-dx-field select:focus,.sc-dx-field textarea:focus{border-color:var(--dx-accent-admin);box-shadow:0 0 0 1px var(--dx-accent-admin);outline:none}
		.sc-dx-field textarea{min-height:80px;font-family:monospace;font-size:11px}
		.sc-dx-color-row{display:flex;gap:12px;flex-wrap:wrap}
		.sc-dx-color-item{display:flex;flex-direction:column;align-items:center;gap:4px}
		.sc-dx-color-item label{font-size:10px;color:var(--dx-muted);font-weight:600}
		.sc-dx-color-item input[type=\"color\"]{width:36px;height:36px;border:2px solid var(--dx-border);border-radius:8px;padding:2px;cursor:pointer;background:#fff}
		.sc-dx-locs{display:flex;flex-direction:column;gap:6px}
		.sc-dx-loc{border:1px solid var(--dx-border);border-radius:10px;overflow:hidden;transition:border-color .2s}
		.sc-dx-loc.is-on{border-color:#d0d4f0}
		.sc-dx-loc.is-fixed{background:#fafbfe}
		.sc-dx-loc-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:default}
		.sc-dx-loc-icon{flex:0 0 28px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#f2f3f9;border-radius:8px;font-size:14px}
		.sc-dx-loc.is-on .sc-dx-loc-icon{background:#eef0ff}
		.sc-dx-loc-info{flex:1;min-width:0}
		.sc-dx-loc-name{display:block;font-size:13px;font-weight:600;color:var(--dx-text)}
		.sc-dx-loc-hint{display:block;font-size:11px;color:var(--dx-muted);margin-top:1px}
		.sc-dx-badge-on{background:#ecfdf3;color:#15803d;border-radius:999px;padding:2px 9px;font-size:10px;font-weight:600}
		.sc-dx-loc-panel{display:none;border-top:1px solid var(--dx-border);background:#fbfcff;padding:12px 14px}
		.sc-dx-toggle{position:relative;width:36px;height:20px;display:inline-block;flex-shrink:0}
		.sc-dx-toggle input{opacity:0;width:0;height:0;position:absolute}
		.sc-dx-toggle span{position:absolute;inset:0;background:#c7cbda;border-radius:99px;transition:.2s}
		.sc-dx-toggle span::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:3px;left:3px;transition:.2s}
		.sc-dx-toggle input:checked+span{background:var(--dx-accent-admin)}
		.sc-dx-toggle input:checked+span::after{transform:translateX(16px)}
		.sc-dx-sc-output{display:flex;align-items:center;gap:8px;margin-bottom:8px}
		.sc-dx-sc-output code{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;flex:1;overflow-x:auto}
		.sc-dx-sc-copy{border:1px solid var(--dx-border);background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:600;color:var(--dx-muted);transition:all .15s}
		.sc-dx-sc-copy:hover{border-color:var(--dx-accent-admin);color:var(--dx-accent-admin)}
		.sc-dx-grid-4 label{display:block;font-size:11px;color:var(--dx-muted);margin-bottom:4px}
		.sc-dx-grid-4 select{width:100%;border:1px solid var(--dx-border);border-radius:8px;padding:5px 8px;font-size:12px}
		.sc-dx-submit{margin-top:12px}

		@media(max-width:720px){
			.sc-dx-grid-3{grid-template-columns:1fr 1fr}
			.sc-dx-grid-4{grid-template-columns:1fr 1fr}
			.sc-dx-style-row{flex-wrap:wrap}
			.sc-dx-color-row{gap:8px}
		}
		";

		wp_add_inline_style( 'swiftcurrency-admin', $style );

		$script = "
		(function(){
			'use strict';
			var q=function(s,c){return(c||document).querySelector(s)};
			var qa=function(s,c){return(c||document).querySelectorAll(s)};

			function renderPreview(){
				var box=q('#sc-dx-preview-box');if(!box)return;
				var style=q('input[name*=\"[switcher_style]\"]:checked');
				style=style?style.value:'pill_dropdown';
				var fs=q('input[name*=\"[font_size]\"]');
				var br=q('input[name*=\"[border_radius]\"]'),bw=q('input[name*=\"[border_width]\"]'),pd=q('input[name*=\"[padding]\"]');
				var ac=q('input[name*=\"[accent_color]\"]'),tc=q('input[name*=\"[text_color]\"]');
				var bg=q('input[name*=\"[bg_color]\"]'),hv=q('input[name*=\"[hover_color]\"]'),bc=q('input[name*=\"[border_color]\"]');
				var S={fs:fs?fs.value:'14',br:br?br.value:'8',bw:bw?bw.value:'1',pd:pd?pd.value:'8',
					ac:ac?ac.value:'#0073aa',tc:tc?tc.value:'#1e2a35',bg:bg?bg.value:'#fff',hv:hv?hv.value:'#f0f2ff',bc:bc?bc.value:'#dce3ec'};
				
				var isList = (style === 'list');
				var isNative = (style === 'native_select');
				if(br && br.closest('.sc-dx-field')) br.closest('.sc-dx-field').style.display = isList ? 'none' : 'block';
				if(bw && bw.closest('.sc-dx-field')) bw.closest('.sc-dx-field').style.display = isList ? 'none' : 'block';
				if(pd && pd.closest('.sc-dx-field')) pd.closest('.sc-dx-field').style.display = (isList || isNative) ? 'none' : 'block';
				if(bg && bg.closest('.sc-dx-color-item')) bg.closest('.sc-dx-color-item').style.display = isList ? 'none' : 'flex';
				if(bc && bc.closest('.sc-dx-color-item')) bc.closest('.sc-dx-color-item').style.display = isList ? 'none' : 'flex';
				if(hv && hv.closest('.sc-dx-color-item')) hv.closest('.sc-dx-color-item').style.display = (isList || isNative) ? 'none' : 'flex';

				var base='font-size:'+S.fs+'px;border-radius:'+S.br+'px;border:'+S.bw+'px solid '+S.bc+';color:'+S.tc+';background:'+S.bg+';padding:'+S.pd+'px;';
				var html='';
				if(style==='pill_dropdown'){
					html='<div style=\"font-size:'+S.fs+'px;border:'+S.bw+'px solid '+S.bc+';color:'+S.tc+';background:'+S.bg+';padding:'+S.pd+'px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;border-radius:99px\"><span>🇺🇸</span> <span>USD</span> <span style=\"opacity:.5\">▾</span></div>';
				}else if(style==='list'){
					var item='font-size:'+S.fs+'px;display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px;';
					html='<div style=\"display:flex;flex-direction:column;\">';
					html+='<div style=\"'+item+'color:'+S.ac+'\"><span>🇺🇸</span> USD ✔</div>';
					html+='<div style=\"'+item+'color:'+S.tc+'\"><span>🇪🇺</span> EUR</div>';
					html+='</div>';
				}else if(style==='segmented'){
					html='<div style=\"background:#0f172a;padding:4px;border-radius:12px;display:inline-flex;gap:4px\">';
					html+='<div style=\"background:#fff;color:#000;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,0.05)\">USD</div>';
					html+='<div style=\"color:#fff;padding:6px 12px;font-size:12px;font-weight:600;opacity:0.6\">EUR</div>';
					html+='</div>';
				}else if(style==='stack'){
					var sitem='display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid '+S.bc+';border-radius:10px;min-width:180px;margin-bottom:6px;background:'+S.bg+';';
					html='<div style=\"display:flex;flex-direction:column;\">';
					html+='<div style=\"'+sitem+'border-color:'+S.ac+';background:'+S.hv+'\"><div style=\"display:flex;flex-direction:column\"><span style=\"font-weight:700;font-size:13px;color:'+S.ac+'\">USD</span><span style=\"font-size:10px;opacity:0.6\">United States</span></div><span style=\"font-size:18px;opacity:0.8\">$</span></div>';
					html+='<div style=\"'+sitem+'\"><div style=\"display:flex;flex-direction:column\"><span style=\"font-weight:700;font-size:13px\">EUR</span><span style=\"font-size:10px;opacity:0.6\">Euro Zone</span></div><span style=\"font-size:18px;opacity:0.3\">€</span></div>';
					html+='</div>';
				}else if(style==='glass_float'){
					html='<div style=\"width:48px;height:48px;border-radius:50%;background:'+S.ac+';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-size:20px;font-weight:700\">$</div>';
				}else if(style==='native_select'){
					html='<select style=\"border-radius:3px;border:1px solid '+S.bc+';color:'+S.tc+';background:'+S.bg+';padding:6px;font-size:'+S.fs+'px;outline:none;cursor:pointer;\"><option>🇺🇸 USD</option><option>🇪🇺 EUR</option></select>';
				}else{
					var btn=base+'display:inline-flex;align-items:center;gap:4px;cursor:pointer;';
					html='<div style=\"display:flex;gap:4px\">';
					html+='<div style=\"'+btn+'background:'+S.ac+';color:#fff;border-color:'+S.ac+'\">🇺🇸 USD</div>';
					html+='<div style=\"'+btn+'\">🇪🇺 EUR</div>';
					html+='<div style=\"'+btn+'\">🇬🇧 GBP</div></div>';
				}
				box.innerHTML=html;
				var wrap=q('.sc-dx');if(wrap)wrap.style.setProperty('--dx-accent',S.ac);
			}

			var styleRow = q('#sc-dx-style-row');
			if(styleRow) {
				styleRow.addEventListener('click',function(e){
					var opt=e.target.closest('.sc-dx-style-opt');if(!opt)return;
					qa('.sc-dx-style-opt').forEach(function(x){x.classList.remove('is-active')});
					opt.classList.add('is-active');
					var r=q('input',opt);if(r)r.checked=true;
					renderPreview();
				});
			}

			qa('.sc-dx-pill input').forEach(function(inp){
				inp.addEventListener('change',function(){this.closest('.sc-dx-pill').classList.toggle('is-on',this.checked);renderPreview()});
			});

			qa('.sc-dx-live').forEach(function(inp){inp.addEventListener('input',renderPreview)});
			qa('.sc-dx-live-color').forEach(function(inp){inp.addEventListener('input',renderPreview)});

			qa('.sc-dx-loc').forEach(function(row){
				var cb=q('.sc-dx-toggle input[type=\"checkbox\"]',row);
				if(!cb)return;
				cb.addEventListener('change',function(){
					row.classList.toggle('is-on',cb.checked);
					var panel=q('.sc-dx-loc-panel',row);
					if(panel)panel.style.display=cb.checked?'block':'none';
				});
			});

			function updateSC(){
				var sc='[swiftcurrency_switcher';
				var styleInput = q('input[name=\"swiftcurrency_settings[display][switcher_style]\"]:checked');
				if(styleInput && styleInput.value!=='dropdown') sc+=' style=\"'+styleInput.value+'\"';
				var showFlags=q('input[name*=\"[show_flags]\"]');
				if(showFlags && !showFlags.checked) sc+=' show_flags=\"false\"'; else if(showFlags && showFlags.checked) sc+=' show_flags=\"true\"';
				var showCode=q('input[name*=\"[show_currency_code]\"]');
				if(showCode && !showCode.checked) sc+=' show_code=\"false\"'; else if(showCode && showCode.checked) sc+=' show_code=\"true\"';
				var showSymbol=q('input[name*=\"[show_currency_symbol]\"]');
				if(showSymbol && showSymbol.checked) sc+=' show_symbol=\"true\"';
				var showName=q('input[name*=\"[show_currency_name]\"]');
				if(showName && showName.checked) sc+=' show_name=\"true\"';
				var accent = q('input[name*=\"[accent_color]\"]');
				if(accent && accent.value && accent.value !== '#0073aa') sc+=' accent_color=\"'+accent.value+'\"';
				var fontSize = q('input[name*=\"[font_size]\"]');
				if(fontSize && fontSize.value && fontSize.value !== '14') sc+=' font_size=\"'+fontSize.value+'\"';
				var borderRadius = q('input[name*=\"[border_radius]\"]');
				if(borderRadius && borderRadius.value && borderRadius.value !== '8') sc+=' border_radius=\"'+borderRadius.value+'\"';
				sc+=']';
				var o=q('#sc-dx-sc-code');
				if(o) o.textContent=sc;
			}
			
			qa('input[name*=\"[switcher_style]\"], .sc-dx-pills input, input[name*=\"[accent_color]\"], input[name*=\"[font_size]\"], input[name*=\"[border_radius]\"]').forEach(function(el){
				el.addEventListener('change', updateSC);
				el.addEventListener('input', updateSC);
			});

			var cpBtn=q('#sc-dx-sc-copy');
			if(cpBtn)cpBtn.addEventListener('click',function(){
				var c=q('#sc-dx-sc-code');if(!c)return;
				navigator.clipboard?navigator.clipboard.writeText(c.textContent):void 0;
				var oldText = cpBtn.textContent;
				cpBtn.textContent='" . esc_js( __( 'Copied!', 'swift-currency' ) ) . "';
				setTimeout(function(){cpBtn.textContent=oldText},1500);
			});

			updateSC();
			renderPreview();
		})();";

		wp_add_inline_script( 'swiftcurrency-admin', $script );
	}

	/* helper */
	private function g( $key, $default = '' ) {
		return $this->settings->get( 'display', $key, $default );
	}

	public function render() {
		// ── Global values ──
		$style        = $this->g( 'switcher_style', 'pill_dropdown' );
		$show_flags   = $this->g( 'show_flags', true );
		$show_code    = $this->g( 'show_currency_code', true );
		$show_symbol  = $this->g( 'show_currency_symbol', false );
		$show_name    = $this->g( 'show_currency_name', false );
		$accent       = $this->g( 'accent_color', '#0073aa' );

		// New styling options
		$font_size    = $this->g( 'font_size', '14' );
		$text_color   = $this->g( 'text_color', '#1e2a35' );
		$bg_color     = $this->g( 'bg_color', '#ffffff' );
		$hover_color  = $this->g( 'hover_color', '#f0f2ff' );
		$border_color = $this->g( 'border_color', '#dce3ec' );
		$border_width = $this->g( 'border_width', '1' );
		$border_radius = $this->g( 'border_radius', '8' );
		$padding      = $this->g( 'padding', '8' );

		// Sticky options
		$sticky_side   = $this->g( 'sticky_side', 'right' );
		$sticky_offset = $this->g( 'sticky_offset', 40 );
		$sticky_label  = $this->g( 'sticky_label', '' );

		$locations = array(
			array( 'id' => 'header', 'name' => __( 'Site Header', 'swift-currency' ), 'hint' => __( 'Top bar above content', 'swift-currency' ), 'field' => 'placement_header', 'icon' => '⬆' ),
			array( 'id' => 'nav',    'name' => __( 'Navigation Menu', 'swift-currency' ), 'hint' => __( 'Appended to primary nav', 'swift-currency' ), 'field' => 'placement_nav', 'icon' => '☰' ),
			array( 'id' => 'cart',   'name' => __( 'Cart / Checkout', 'swift-currency' ), 'hint' => __( 'Above WooCommerce totals', 'swift-currency' ), 'field' => 'placement_cart', 'icon' => '🛒' ),
			array( 'id' => 'footer', 'name' => __( 'Site Footer', 'swift-currency' ), 'hint' => __( 'Before closing footer', 'swift-currency' ), 'field' => 'placement_footer', 'icon' => '⬇' ),
			array( 'id' => 'sticky', 'name' => __( 'Floating Widget', 'swift-currency' ), 'hint' => __( 'Fixed button on screen edge', 'swift-currency' ), 'field' => 'placement_sticky', 'icon' => '📌' ),
		);

		$styles = array( 
			'pill_dropdown' => __( 'Pill Dropdown', 'swift-currency' ),
			'list'          => __( 'List', 'swift-currency' ), 
			'buttons'       => __( 'Buttons', 'swift-currency' ),
			'segmented'     => __( 'Segmented', 'swift-currency' ),
			'stack'         => __( 'Stack', 'swift-currency' ),
			'glass_float'   => __( 'Glass Float', 'swift-currency' ),
			'native_select' => __( 'Native Select', 'swift-currency' )
		);
		$n = 'swiftcurrency_settings[display]';
		?>
		<form method="post" action="options.php" class="swiftcurrency-form sc-display-form">
			<?php settings_fields( 'swiftcurrency_settings' ); ?>
			<div class="sc-dx" style="--dx-accent:<?php echo esc_attr( $accent ); ?>">

			<!-- Header -->
			<div class="sc-dx-head">
				<h2><?php esc_html_e( 'Display Options', 'swift-currency' ); ?></h2>
				<p><?php esc_html_e( 'Global switcher style, appearance, and placement.', 'swift-currency' ); ?></p>
			</div>

			<!-- ═══ Live Preview ═══ -->
			<div class="sc-dx-card">
				<span class="sc-dx-sec-label"><?php esc_html_e( 'Live Preview', 'swift-currency' ); ?></span>
				<div class="sc-dx-preview-wrap" id="sc-dx-preview-wrap">
					<div class="sc-dx-preview-box" id="sc-dx-preview-box"></div>
				</div>

				<!-- Moved Shortcode Display -->
				<div class="sc-dx-sc-output" style="background:#f0f6fb;padding:12px;border-radius:8px;border:1px solid #c3d9e9;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:15px;">
					<code id="sc-dx-sc-code" style="font-family:Monaco,Consolas,monospace;font-size:13px;color:#2271b1;word-break:break-all;">[swiftcurrency_switcher]</code>
					<button type="button" class="button" id="sc-dx-sc-copy" style="white-space:nowrap;"><?php esc_html_e( 'Copy Code', 'swift-currency' ); ?></button>
				</div>
			</div>

			<!-- ═══ Switcher Style ═══ -->
			<div class="sc-dx-card">
				<span class="sc-dx-sec-label"><?php esc_html_e( 'Switcher Style', 'swift-currency' ); ?></span>
				<div class="sc-dx-style-row" id="sc-dx-style-row">
					<?php 
					foreach ( $styles as $sval => $slabel ) : ?>
						<label class="sc-dx-style-opt <?php echo esc_attr( ( $style === $sval ) ? 'is-active' : '' ); ?>">
							<input type="radio" name="<?php echo esc_attr( $n ); ?>[switcher_style]" value="<?php echo esc_attr( $sval ); ?>" <?php checked( $style, $sval ); ?>>
							<span class="sc-dx-style-thumb sc-dx-sthumb--<?php echo esc_attr( $sval ); ?>"></span>
							<span class="sc-dx-style-name"><?php echo esc_html( $slabel ); ?></span>
						</label>
					<?php endforeach; ?>
				</div>
				<!-- Display pills -->
				<div style="margin-top:12px">
					<span class="sc-dx-mini-label"><?php esc_html_e( 'Display Elements', 'swift-currency' ); ?></span>
					<div class="sc-dx-pills">
						<?php
						$pills = array(
							array( 'key' => 'show_flags', 'label' => '🏳️ Flags', 'val' => $show_flags ),
							array( 'key' => 'show_currency_code', 'label' => 'ABC Code', 'val' => $show_code ),
							array( 'key' => 'show_currency_symbol', 'label' => '$ Symbol', 'val' => $show_symbol ),
							array( 'key' => 'show_currency_name', 'label' => 'Name', 'val' => $show_name ),
						);
						foreach ( $pills as $pill ) : ?>
							<label class="sc-dx-pill <?php echo esc_attr( $pill['val'] ? 'is-on' : '' ); ?>">
								<input type="hidden" name="<?php echo esc_attr( $n ); ?>[<?php echo esc_attr( $pill['key'] ); ?>]" value="0">
								<input type="checkbox" name="<?php echo esc_attr( $n ); ?>[<?php echo esc_attr( $pill['key'] ); ?>]" value="1" <?php checked( $pill['val'] ); ?>>
								<span><?php echo esc_html( $pill['label'] ); ?></span>
							</label>
						<?php endforeach; ?>
					</div>
				</div>
			</div>

			<!-- ═══ Appearance ═══ -->
			<div class="sc-dx-card">
				<span class="sc-dx-sec-label"><?php esc_html_e( 'Appearance', 'swift-currency' ); ?></span>
				<div class="sc-dx-grid-4">
					<div class="sc-dx-field">
						<label><?php esc_html_e( 'Font Size (px)', 'swift-currency' ); ?></label>
						<input type="number" name="<?php echo esc_attr( $n ); ?>[font_size]" class="sc-dx-live" data-css="font-size" value="<?php echo esc_attr( $font_size ); ?>" min="10" max="24">
					</div>
					<div class="sc-dx-field">
						<label><?php esc_html_e( 'Padding (px)', 'swift-currency' ); ?></label>
						<input type="number" name="<?php echo esc_attr( $n ); ?>[padding]" class="sc-dx-live" data-css="padding" value="<?php echo esc_attr( $padding ); ?>" min="0" max="30">
					</div>
					<div class="sc-dx-field">
						<label><?php esc_html_e( 'Border Radius (px)', 'swift-currency' ); ?></label>
						<input type="number" name="<?php echo esc_attr( $n ); ?>[border_radius]" class="sc-dx-live" data-css="border-radius" value="<?php echo esc_attr( $border_radius ); ?>" min="0" max="50">
					</div>
					<div class="sc-dx-field">
						<label><?php esc_html_e( 'Border Width (px)', 'swift-currency' ); ?></label>
						<input type="number" name="<?php echo esc_attr( $n ); ?>[border_width]" class="sc-dx-live" data-css="border-width" value="<?php echo esc_attr( $border_width ); ?>" min="0" max="5">
					</div>
				</div>

				<!-- Colors row -->
				<div style="margin-top:14px">
					<span class="sc-dx-mini-label"><?php esc_html_e( 'Colors', 'swift-currency' ); ?></span>
					<div class="sc-dx-color-row">
						<?php
						$colors = array(
							array( 'key' => 'accent_color', 'label' => __( 'Accent', 'swift-currency' ), 'val' => $accent ),
							array( 'key' => 'text_color', 'label' => __( 'Text', 'swift-currency' ), 'val' => $text_color ),
							array( 'key' => 'bg_color', 'label' => __( 'Background', 'swift-currency' ), 'val' => $bg_color ),
							array( 'key' => 'hover_color', 'label' => __( 'Hover', 'swift-currency' ), 'val' => $hover_color ),
							array( 'key' => 'border_color', 'label' => __( 'Border', 'swift-currency' ), 'val' => $border_color ),
						);
						foreach ( $colors as $c ) : ?>
							<div class="sc-dx-color-item">
								<label><?php echo esc_html( $c['label'] ); ?></label>
								<input type="color" name="<?php echo esc_attr( $n ); ?>[<?php echo esc_attr( $c['key'] ); ?>]" value="<?php echo esc_attr( $c['val'] ); ?>" class="sc-dx-live-color" data-key="<?php echo esc_attr( $c['key'] ); ?>">
							</div>
						<?php endforeach; ?>
					</div>
				</div>
			</div>

			<!-- ═══ Locations ═══ -->
			<div class="sc-dx-card">
				<span class="sc-dx-sec-label"><?php esc_html_e( 'Locations', 'swift-currency' ); ?></span>
				<div class="sc-dx-locs">
					<?php foreach ( $locations as $loc ) :
						$enabled = $this->g( $loc['field'], false );
					?>
						<div class="sc-dx-loc <?php echo esc_attr( $enabled ? 'is-on' : '' ); ?>">
							<div class="sc-dx-loc-bar">
								<span class="sc-dx-loc-icon"><?php echo esc_html( $loc['icon'] ); ?></span>
								<div class="sc-dx-loc-info">
									<span class="sc-dx-loc-name"><?php echo esc_html( $loc['name'] ); ?></span>
									<span class="sc-dx-loc-hint"><?php echo esc_html( $loc['hint'] ); ?></span>
								</div>
								<label class="sc-dx-toggle">
									<input type="hidden" name="<?php echo esc_attr( $n ); ?>[<?php echo esc_attr( $loc['field'] ); ?>]" value="0">
									<input type="checkbox" name="<?php echo esc_attr( $n ); ?>[<?php echo esc_attr( $loc['field'] ); ?>]" value="1" <?php checked( $enabled ); ?>>
									<span></span>
								</label>
							</div>
							<div class="sc-dx-loc-panel" <?php echo $enabled ? 'style="display:block"' : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static safe strings only. ?>>
								<div class="sc-dx-grid-3">
									<div class="sc-dx-field">
										<label><?php esc_html_e( 'Style Override', 'swift-currency' ); ?></label>
										<select name="<?php echo esc_attr( $n ); ?>[loc_style_<?php echo esc_attr( $loc['id'] ); ?>]">
											<option value=""><?php esc_html_e( 'Global Style', 'swift-currency' ); ?></option>
											<?php foreach ( $styles as $sval => $slabel ) : ?>
												<option value="<?php echo esc_attr( $sval ); ?>" <?php selected( $this->g( 'loc_style_' . $loc['id'], '' ), $sval ); ?>><?php echo esc_html( $slabel ); ?></option>
											<?php endforeach; ?>
										</select>
									</div>
									<?php if ( 'sticky' === $loc['id'] ) : ?>
									<div class="sc-dx-field">
										<label><?php esc_html_e( 'Side', 'swift-currency' ); ?></label>
										<select name="<?php echo esc_attr( $n ); ?>[sticky_side]">
											<option value="left" <?php selected( $sticky_side, 'left' ); ?>><?php esc_html_e( 'Left', 'swift-currency' ); ?></option>
											<option value="right" <?php selected( $sticky_side, 'right' ); ?>><?php esc_html_e( 'Right', 'swift-currency' ); ?></option>
										</select>
									</div>
									<div class="sc-dx-field">
										<label><?php esc_html_e( 'Offset %', 'swift-currency' ); ?></label>
										<input type="number" name="<?php echo esc_attr( $n ); ?>[sticky_offset]" min="0" max="98" value="<?php echo esc_attr( (int) $sticky_offset ); ?>">
									</div>
									<div class="sc-dx-field">
										<label><?php esc_html_e( 'Label', 'swift-currency' ); ?></label>
										<input type="text" name="<?php echo esc_attr( $n ); ?>[sticky_label]" value="<?php echo esc_attr( $sticky_label ); ?>" placeholder="e.g. Currency">
									</div>
									<?php endif; ?>
								</div>
							</div>
						</div>
					<?php endforeach; ?>

					<!-- Elementor Pro Hint -->
					<div class="sc-dx-loc" style="opacity: 0.85; background: #fdfdfd; border-style: dashed;">
						<div class="sc-dx-loc-bar" style="cursor: default;">
							<span class="sc-dx-loc-icon" style="background: #f0f0f0; color: #999;"><span class="dashicons dashicons-layout" style="font-size: 17px; margin-top: 5px;"></span></span>
							<div class="sc-dx-loc-info">
								<span class="sc-dx-loc-name">
									<?php esc_html_e( 'Elementor Widget', 'swift-currency' ); ?> 
									<span style="background: #eee; color: #777; font-size: 9px; padding: 2px 6px; border-radius: 4px; margin-left: 5px; vertical-align: middle; text-transform: uppercase; font-weight: 700;">
										<?php esc_html_e( 'PRO', 'swift-currency' ); ?>
									</span>
								</span>
								<span class="sc-dx-loc-hint"><?php esc_html_e( 'Build custom switchers inside the Elementor editor (Coming to Pro).', 'swift-currency' ); ?></span>
							</div>
							<div style="font-size: 11px; color: #aaa; font-style: italic; margin-right: 5px;">
								<?php esc_html_e( 'Available in Pro', 'swift-currency' ); ?>
							</div>
						</div>
					</div>
				</div>
			</div>

			<?php
			/**
			 * Hook to render additional sections in Display tab.
			 * Used by Pro to add dynamic widgets, etc.
			 */
			do_action( 'swiftcurrency_admin_display_tab_bottom', $this->settings );
			?>

			<div class="sc-dx-submit"><?php submit_button( __( 'Save Changes', 'swift-currency' ), 'primary', 'submit', false ); ?></div>
			</div>
		</form>
		<?php
	}
}
