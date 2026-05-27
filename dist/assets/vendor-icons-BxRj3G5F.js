import{R as Ne,r as Rt}from"./vendor-oTkEde-c.js";function za(a,e){(e==null||e>a.length)&&(e=a.length);for(var t=0,r=Array(e);t<e;t++)r[t]=a[t];return r}function Ut(a){if(Array.isArray(a))return a}function Wt(a){if(Array.isArray(a))return za(a)}function Yt(a,e){if(!(a instanceof e))throw new TypeError("Cannot call a class as a function")}function Ht(a,e){for(var t=0;t<e.length;t++){var r=e[t];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(a,Ee(r.key),r)}}function Bt(a,e,t){return e&&Ht(a.prototype,e),Object.defineProperty(a,"prototype",{writable:!1}),a}function sa(a,e){var t=typeof Symbol<"u"&&a[Symbol.iterator]||a["@@iterator"];if(!t){if(Array.isArray(a)||(t=Ra(a))||e){t&&(a=t);var r=0,n=function(){};return{s:n,n:function(){return r>=a.length?{done:!0}:{done:!1,value:a[r++]}},e:function(l){throw l},f:n}}throw new TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}var i,s=!0,o=!1;return{s:function(){t=t.call(a)},n:function(){var l=t.next();return s=l.done,l},e:function(l){o=!0,i=l},f:function(){try{s||t.return==null||t.return()}finally{if(o)throw i}}}}function p(a,e,t){return(e=Ee(e))in a?Object.defineProperty(a,e,{value:t,enumerable:!0,configurable:!0,writable:!0}):a[e]=t,a}function Gt(a){if(typeof Symbol<"u"&&a[Symbol.iterator]!=null||a["@@iterator"]!=null)return Array.from(a)}function Vt(a,e){var t=a==null?null:typeof Symbol<"u"&&a[Symbol.iterator]||a["@@iterator"];if(t!=null){var r,n,i,s,o=[],l=!0,c=!1;try{if(i=(t=t.call(a)).next,e===0){if(Object(t)!==t)return;l=!1}else for(;!(l=(r=i.call(t)).done)&&(o.push(r.value),o.length!==e);l=!0);}catch(u){c=!0,n=u}finally{try{if(!l&&t.return!=null&&(s=t.return(),Object(s)!==s))return}finally{if(c)throw n}}return o}}function Xt(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Kt(){throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Qa(a,e){var t=Object.keys(a);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(a);e&&(r=r.filter(function(n){return Object.getOwnPropertyDescriptor(a,n).enumerable})),t.push.apply(t,r)}return t}function f(a){for(var e=1;e<arguments.length;e++){var t=arguments[e]!=null?arguments[e]:{};e%2?Qa(Object(t),!0).forEach(function(r){p(a,r,t[r])}):Object.getOwnPropertyDescriptors?Object.defineProperties(a,Object.getOwnPropertyDescriptors(t)):Qa(Object(t)).forEach(function(r){Object.defineProperty(a,r,Object.getOwnPropertyDescriptor(t,r))})}return a}function da(a,e){return Ut(a)||Vt(a,e)||Ra(a,e)||Xt()}function M(a){return Wt(a)||Gt(a)||Ra(a)||Kt()}function qt(a,e){if(typeof a!="object"||!a)return a;var t=a[Symbol.toPrimitive];if(t!==void 0){var r=t.call(a,e);if(typeof r!="object")return r;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(a)}function Ee(a){var e=qt(a,"string");return typeof e=="symbol"?e:e+""}function fa(a){"@babel/helpers - typeof";return fa=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},fa(a)}function Ra(a,e){if(a){if(typeof a=="string")return za(a,e);var t={}.toString.call(a).slice(8,-1);return t==="Object"&&a.constructor&&(t=a.constructor.name),t==="Map"||t==="Set"?Array.from(a):t==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?za(a,e):void 0}}var Za=function(){},Ua={},Fe={},Oe=null,Te={mark:Za,measure:Za};try{typeof window<"u"&&(Ua=window),typeof document<"u"&&(Fe=document),typeof MutationObserver<"u"&&(Oe=MutationObserver),typeof performance<"u"&&(Te=performance)}catch{}var Jt=Ua.navigator||{},ae=Jt.userAgent,ee=ae===void 0?"":ae,_=Ua,x=Fe,te=Oe,na=Te;_.document;var T=!!x.documentElement&&!!x.head&&typeof x.addEventListener=="function"&&typeof x.createElement=="function",_e=~ee.indexOf("MSIE")||~ee.indexOf("Trident/"),ba,Qt=/fa(k|kd|s|r|l|t|d|dr|dl|dt|b|slr|slpr|wsb|tl|ns|nds|es|jr|jfr|jdr|usb|ufsb|udsb|cr|ss|sr|sl|st|sds|sdr|sdl|sdt)?[\-\ ]/,Zt=/Font ?Awesome ?([567 ]*)(Solid|Regular|Light|Thin|Duotone|Brands|Free|Pro|Sharp Duotone|Sharp|Kit|Notdog Duo|Notdog|Chisel|Etch|Thumbprint|Jelly Fill|Jelly Duo|Jelly|Utility|Utility Fill|Utility Duo|Slab Press|Slab|Whiteboard)?.*/i,je={classic:{fa:"solid",fas:"solid","fa-solid":"solid",far:"regular","fa-regular":"regular",fal:"light","fa-light":"light",fat:"thin","fa-thin":"thin",fab:"brands","fa-brands":"brands"},duotone:{fa:"solid",fad:"solid","fa-solid":"solid","fa-duotone":"solid",fadr:"regular","fa-regular":"regular",fadl:"light","fa-light":"light",fadt:"thin","fa-thin":"thin"},sharp:{fa:"solid",fass:"solid","fa-solid":"solid",fasr:"regular","fa-regular":"regular",fasl:"light","fa-light":"light",fast:"thin","fa-thin":"thin"},"sharp-duotone":{fa:"solid",fasds:"solid","fa-solid":"solid",fasdr:"regular","fa-regular":"regular",fasdl:"light","fa-light":"light",fasdt:"thin","fa-thin":"thin"},slab:{"fa-regular":"regular",faslr:"regular"},"slab-press":{"fa-regular":"regular",faslpr:"regular"},thumbprint:{"fa-light":"light",fatl:"light"},whiteboard:{"fa-semibold":"semibold",fawsb:"semibold"},notdog:{"fa-solid":"solid",fans:"solid"},"notdog-duo":{"fa-solid":"solid",fands:"solid"},etch:{"fa-solid":"solid",faes:"solid"},jelly:{"fa-regular":"regular",fajr:"regular"},"jelly-fill":{"fa-regular":"regular",fajfr:"regular"},"jelly-duo":{"fa-regular":"regular",fajdr:"regular"},chisel:{"fa-regular":"regular",facr:"regular"},utility:{"fa-semibold":"semibold",fausb:"semibold"},"utility-duo":{"fa-semibold":"semibold",faudsb:"semibold"},"utility-fill":{"fa-semibold":"semibold",faufsb:"semibold"}},ar={GROUP:"duotone-group",PRIMARY:"primary",SECONDARY:"secondary"},De=["fa-classic","fa-duotone","fa-sharp","fa-sharp-duotone","fa-thumbprint","fa-whiteboard","fa-notdog","fa-notdog-duo","fa-chisel","fa-etch","fa-jelly","fa-jelly-fill","fa-jelly-duo","fa-slab","fa-slab-press","fa-utility","fa-utility-duo","fa-utility-fill"],z="classic",aa="duotone",$e="sharp",Re="sharp-duotone",Ue="chisel",We="etch",Ye="jelly",He="jelly-duo",Be="jelly-fill",Ge="notdog",Ve="notdog-duo",Xe="slab",Ke="slab-press",qe="thumbprint",Je="utility",Qe="utility-duo",Ze="utility-fill",at="whiteboard",er="Classic",tr="Duotone",rr="Sharp",nr="Sharp Duotone",ir="Chisel",sr="Etch",or="Jelly",lr="Jelly Duo",fr="Jelly Fill",cr="Notdog",ur="Notdog Duo",dr="Slab",mr="Slab Press",vr="Thumbprint",pr="Utility",hr="Utility Duo",gr="Utility Fill",br="Whiteboard",et=[z,aa,$e,Re,Ue,We,Ye,He,Be,Ge,Ve,Xe,Ke,qe,Je,Qe,Ze,at];ba={},p(p(p(p(p(p(p(p(p(p(ba,z,er),aa,tr),$e,rr),Re,nr),Ue,ir),We,sr),Ye,or),He,lr),Be,fr),Ge,cr),p(p(p(p(p(p(p(p(ba,Ve,ur),Xe,dr),Ke,mr),qe,vr),Je,pr),Qe,hr),Ze,gr),at,br);var yr={classic:{900:"fas",400:"far",normal:"far",300:"fal",100:"fat"},duotone:{900:"fad",400:"fadr",300:"fadl",100:"fadt"},sharp:{900:"fass",400:"fasr",300:"fasl",100:"fast"},"sharp-duotone":{900:"fasds",400:"fasdr",300:"fasdl",100:"fasdt"},slab:{400:"faslr"},"slab-press":{400:"faslpr"},whiteboard:{600:"fawsb"},thumbprint:{300:"fatl"},notdog:{900:"fans"},"notdog-duo":{900:"fands"},etch:{900:"faes"},chisel:{400:"facr"},jelly:{400:"fajr"},"jelly-fill":{400:"fajfr"},"jelly-duo":{400:"fajdr"},utility:{600:"fausb"},"utility-duo":{600:"faudsb"},"utility-fill":{600:"faufsb"}},xr={"Font Awesome 7 Free":{900:"fas",400:"far"},"Font Awesome 7 Pro":{900:"fas",400:"far",normal:"far",300:"fal",100:"fat"},"Font Awesome 7 Brands":{400:"fab",normal:"fab"},"Font Awesome 7 Duotone":{900:"fad",400:"fadr",normal:"fadr",300:"fadl",100:"fadt"},"Font Awesome 7 Sharp":{900:"fass",400:"fasr",normal:"fasr",300:"fasl",100:"fast"},"Font Awesome 7 Sharp Duotone":{900:"fasds",400:"fasdr",normal:"fasdr",300:"fasdl",100:"fasdt"},"Font Awesome 7 Jelly":{400:"fajr",normal:"fajr"},"Font Awesome 7 Jelly Fill":{400:"fajfr",normal:"fajfr"},"Font Awesome 7 Jelly Duo":{400:"fajdr",normal:"fajdr"},"Font Awesome 7 Slab":{400:"faslr",normal:"faslr"},"Font Awesome 7 Slab Press":{400:"faslpr",normal:"faslpr"},"Font Awesome 7 Thumbprint":{300:"fatl",normal:"fatl"},"Font Awesome 7 Notdog":{900:"fans",normal:"fans"},"Font Awesome 7 Notdog Duo":{900:"fands",normal:"fands"},"Font Awesome 7 Etch":{900:"faes",normal:"faes"},"Font Awesome 7 Chisel":{400:"facr",normal:"facr"},"Font Awesome 7 Whiteboard":{600:"fawsb",normal:"fawsb"},"Font Awesome 7 Utility":{600:"fausb",normal:"fausb"},"Font Awesome 7 Utility Duo":{600:"faudsb",normal:"faudsb"},"Font Awesome 7 Utility Fill":{600:"faufsb",normal:"faufsb"}},Sr=new Map([["classic",{defaultShortPrefixId:"fas",defaultStyleId:"solid",styleIds:["solid","regular","light","thin","brands"],futureStyleIds:[],defaultFontWeight:900}],["duotone",{defaultShortPrefixId:"fad",defaultStyleId:"solid",styleIds:["solid","regular","light","thin"],futureStyleIds:[],defaultFontWeight:900}],["sharp",{defaultShortPrefixId:"fass",defaultStyleId:"solid",styleIds:["solid","regular","light","thin"],futureStyleIds:[],defaultFontWeight:900}],["sharp-duotone",{defaultShortPrefixId:"fasds",defaultStyleId:"solid",styleIds:["solid","regular","light","thin"],futureStyleIds:[],defaultFontWeight:900}],["chisel",{defaultShortPrefixId:"facr",defaultStyleId:"regular",styleIds:["regular"],futureStyleIds:[],defaultFontWeight:400}],["etch",{defaultShortPrefixId:"faes",defaultStyleId:"solid",styleIds:["solid"],futureStyleIds:[],defaultFontWeight:900}],["jelly",{defaultShortPrefixId:"fajr",defaultStyleId:"regular",styleIds:["regular"],futureStyleIds:[],defaultFontWeight:400}],["jelly-duo",{defaultShortPrefixId:"fajdr",defaultStyleId:"regular",styleIds:["regular"],futureStyleIds:[],defaultFontWeight:400}],["jelly-fill",{defaultShortPrefixId:"fajfr",defaultStyleId:"regular",styleIds:["regular"],futureStyleIds:[],defaultFontWeight:400}],["notdog",{defaultShortPrefixId:"fans",defaultStyleId:"solid",styleIds:["solid"],futureStyleIds:[],defaultFontWeight:900}],["notdog-duo",{defaultShortPrefixId:"fands",defaultStyleId:"solid",styleIds:["solid"],futureStyleIds:[],defaultFontWeight:900}],["slab",{defaultShortPrefixId:"faslr",defaultStyleId:"regular",styleIds:["regular"],futureStyleIds:[],defaultFontWeight:400}],["slab-press",{defaultShortPrefixId:"faslpr",defaultStyleId:"regular",styleIds:["regular"],futureStyleIds:[],defaultFontWeight:400}],["thumbprint",{defaultShortPrefixId:"fatl",defaultStyleId:"light",styleIds:["light"],futureStyleIds:[],defaultFontWeight:300}],["utility",{defaultShortPrefixId:"fausb",defaultStyleId:"semibold",styleIds:["semibold"],futureStyleIds:[],defaultFontWeight:600}],["utility-duo",{defaultShortPrefixId:"faudsb",defaultStyleId:"semibold",styleIds:["semibold"],futureStyleIds:[],defaultFontWeight:600}],["utility-fill",{defaultShortPrefixId:"faufsb",defaultStyleId:"semibold",styleIds:["semibold"],futureStyleIds:[],defaultFontWeight:600}],["whiteboard",{defaultShortPrefixId:"fawsb",defaultStyleId:"semibold",styleIds:["semibold"],futureStyleIds:[],defaultFontWeight:600}]]),wr={chisel:{regular:"facr"},classic:{brands:"fab",light:"fal",regular:"far",solid:"fas",thin:"fat"},duotone:{light:"fadl",regular:"fadr",solid:"fad",thin:"fadt"},etch:{solid:"faes"},jelly:{regular:"fajr"},"jelly-duo":{regular:"fajdr"},"jelly-fill":{regular:"fajfr"},notdog:{solid:"fans"},"notdog-duo":{solid:"fands"},sharp:{light:"fasl",regular:"fasr",solid:"fass",thin:"fast"},"sharp-duotone":{light:"fasdl",regular:"fasdr",solid:"fasds",thin:"fasdt"},slab:{regular:"faslr"},"slab-press":{regular:"faslpr"},thumbprint:{light:"fatl"},utility:{semibold:"fausb"},"utility-duo":{semibold:"faudsb"},"utility-fill":{semibold:"faufsb"},whiteboard:{semibold:"fawsb"}},tt=["fak","fa-kit","fakd","fa-kit-duotone"],re={kit:{fak:"kit","fa-kit":"kit"},"kit-duotone":{fakd:"kit-duotone","fa-kit-duotone":"kit-duotone"}},Ar=["kit"],kr="kit",zr="kit-duotone",Lr="Kit",Cr="Kit Duotone";p(p({},kr,Lr),zr,Cr);var Mr={kit:{"fa-kit":"fak"}},Pr={"Font Awesome Kit":{400:"fak",normal:"fak"},"Font Awesome Kit Duotone":{400:"fakd",normal:"fakd"}},Ir={kit:{fak:"fa-kit"}},ne={kit:{kit:"fak"},"kit-duotone":{"kit-duotone":"fakd"}},ya,ia={GROUP:"duotone-group",SWAP_OPACITY:"swap-opacity",PRIMARY:"primary",SECONDARY:"secondary"},Nr=["fa-classic","fa-duotone","fa-sharp","fa-sharp-duotone","fa-thumbprint","fa-whiteboard","fa-notdog","fa-notdog-duo","fa-chisel","fa-etch","fa-jelly","fa-jelly-fill","fa-jelly-duo","fa-slab","fa-slab-press","fa-utility","fa-utility-duo","fa-utility-fill"],Er="classic",Fr="duotone",Or="sharp",Tr="sharp-duotone",_r="chisel",jr="etch",Dr="jelly",$r="jelly-duo",Rr="jelly-fill",Ur="notdog",Wr="notdog-duo",Yr="slab",Hr="slab-press",Br="thumbprint",Gr="utility",Vr="utility-duo",Xr="utility-fill",Kr="whiteboard",qr="Classic",Jr="Duotone",Qr="Sharp",Zr="Sharp Duotone",an="Chisel",en="Etch",tn="Jelly",rn="Jelly Duo",nn="Jelly Fill",sn="Notdog",on="Notdog Duo",ln="Slab",fn="Slab Press",cn="Thumbprint",un="Utility",dn="Utility Duo",mn="Utility Fill",vn="Whiteboard";ya={},p(p(p(p(p(p(p(p(p(p(ya,Er,qr),Fr,Jr),Or,Qr),Tr,Zr),_r,an),jr,en),Dr,tn),$r,rn),Rr,nn),Ur,sn),p(p(p(p(p(p(p(p(ya,Wr,on),Yr,ln),Hr,fn),Br,cn),Gr,un),Vr,dn),Xr,mn),Kr,vn);var pn="kit",hn="kit-duotone",gn="Kit",bn="Kit Duotone";p(p({},pn,gn),hn,bn);var yn={classic:{"fa-brands":"fab","fa-duotone":"fad","fa-light":"fal","fa-regular":"far","fa-solid":"fas","fa-thin":"fat"},duotone:{"fa-regular":"fadr","fa-light":"fadl","fa-thin":"fadt"},sharp:{"fa-solid":"fass","fa-regular":"fasr","fa-light":"fasl","fa-thin":"fast"},"sharp-duotone":{"fa-solid":"fasds","fa-regular":"fasdr","fa-light":"fasdl","fa-thin":"fasdt"},slab:{"fa-regular":"faslr"},"slab-press":{"fa-regular":"faslpr"},whiteboard:{"fa-semibold":"fawsb"},thumbprint:{"fa-light":"fatl"},notdog:{"fa-solid":"fans"},"notdog-duo":{"fa-solid":"fands"},etch:{"fa-solid":"faes"},jelly:{"fa-regular":"fajr"},"jelly-fill":{"fa-regular":"fajfr"},"jelly-duo":{"fa-regular":"fajdr"},chisel:{"fa-regular":"facr"},utility:{"fa-semibold":"fausb"},"utility-duo":{"fa-semibold":"faudsb"},"utility-fill":{"fa-semibold":"faufsb"}},xn={classic:["fas","far","fal","fat","fad"],duotone:["fadr","fadl","fadt"],sharp:["fass","fasr","fasl","fast"],"sharp-duotone":["fasds","fasdr","fasdl","fasdt"],slab:["faslr"],"slab-press":["faslpr"],whiteboard:["fawsb"],thumbprint:["fatl"],notdog:["fans"],"notdog-duo":["fands"],etch:["faes"],jelly:["fajr"],"jelly-fill":["fajfr"],"jelly-duo":["fajdr"],chisel:["facr"],utility:["fausb"],"utility-duo":["faudsb"],"utility-fill":["faufsb"]},La={classic:{fab:"fa-brands",fad:"fa-duotone",fal:"fa-light",far:"fa-regular",fas:"fa-solid",fat:"fa-thin"},duotone:{fadr:"fa-regular",fadl:"fa-light",fadt:"fa-thin"},sharp:{fass:"fa-solid",fasr:"fa-regular",fasl:"fa-light",fast:"fa-thin"},"sharp-duotone":{fasds:"fa-solid",fasdr:"fa-regular",fasdl:"fa-light",fasdt:"fa-thin"},slab:{faslr:"fa-regular"},"slab-press":{faslpr:"fa-regular"},whiteboard:{fawsb:"fa-semibold"},thumbprint:{fatl:"fa-light"},notdog:{fans:"fa-solid"},"notdog-duo":{fands:"fa-solid"},etch:{faes:"fa-solid"},jelly:{fajr:"fa-regular"},"jelly-fill":{fajfr:"fa-regular"},"jelly-duo":{fajdr:"fa-regular"},chisel:{facr:"fa-regular"},utility:{fausb:"fa-semibold"},"utility-duo":{faudsb:"fa-semibold"},"utility-fill":{faufsb:"fa-semibold"}},Sn=["fa-solid","fa-regular","fa-light","fa-thin","fa-duotone","fa-brands","fa-semibold"],rt=["fa","fas","far","fal","fat","fad","fadr","fadl","fadt","fab","fass","fasr","fasl","fast","fasds","fasdr","fasdl","fasdt","faslr","faslpr","fawsb","fatl","fans","fands","faes","fajr","fajfr","fajdr","facr","fausb","faudsb","faufsb"].concat(Nr,Sn),wn=["solid","regular","light","thin","duotone","brands","semibold"],nt=[1,2,3,4,5,6,7,8,9,10],An=nt.concat([11,12,13,14,15,16,17,18,19,20]),kn=["aw","fw","pull-left","pull-right"],zn=[].concat(M(Object.keys(xn)),wn,kn,["2xs","xs","sm","lg","xl","2xl","beat","border","fade","beat-fade","bounce","flip-both","flip-horizontal","flip-vertical","flip","inverse","layers","layers-bottom-left","layers-bottom-right","layers-counter","layers-text","layers-top-left","layers-top-right","li","pull-end","pull-start","pulse","rotate-180","rotate-270","rotate-90","rotate-by","shake","spin-pulse","spin-reverse","spin","stack-1x","stack-2x","stack","ul","width-auto","width-fixed",ia.GROUP,ia.SWAP_OPACITY,ia.PRIMARY,ia.SECONDARY]).concat(nt.map(function(a){return"".concat(a,"x")})).concat(An.map(function(a){return"w-".concat(a)})),Ln={"Font Awesome 5 Free":{900:"fas",400:"far"},"Font Awesome 5 Pro":{900:"fas",400:"far",normal:"far",300:"fal"},"Font Awesome 5 Brands":{400:"fab",normal:"fab"},"Font Awesome 5 Duotone":{900:"fad"}},F="___FONT_AWESOME___",Ca=16,it="fa",st="svg-inline--fa",R="data-fa-i2svg",Ma="data-fa-pseudo-element",Cn="data-fa-pseudo-element-pending",Wa="data-prefix",Ya="data-icon",ie="fontawesome-i2svg",Mn="async",Pn=["HTML","HEAD","STYLE","SCRIPT"],ot=["::before","::after",":before",":after"],lt=(function(){try{return!0}catch{return!1}})();function ea(a){return new Proxy(a,{get:function(t,r){return r in t?t[r]:t[z]}})}var ft=f({},je);ft[z]=f(f(f(f({},{"fa-duotone":"duotone"}),je[z]),re.kit),re["kit-duotone"]);var In=ea(ft),Pa=f({},wr);Pa[z]=f(f(f(f({},{duotone:"fad"}),Pa[z]),ne.kit),ne["kit-duotone"]);var se=ea(Pa),Ia=f({},La);Ia[z]=f(f({},Ia[z]),Ir.kit);var Ha=ea(Ia),Na=f({},yn);Na[z]=f(f({},Na[z]),Mr.kit);ea(Na);var Nn=Qt,ct="fa-layers-text",En=Zt,Fn=f({},yr);ea(Fn);var On=["class","data-prefix","data-icon","data-fa-transform","data-fa-mask"],xa=ar,Tn=[].concat(M(Ar),M(zn)),K=_.FontAwesomeConfig||{};function _n(a){var e=x.querySelector("script["+a+"]");if(e)return e.getAttribute(a)}function jn(a){return a===""?!0:a==="false"?!1:a==="true"?!0:a}if(x&&typeof x.querySelector=="function"){var Dn=[["data-family-prefix","familyPrefix"],["data-css-prefix","cssPrefix"],["data-family-default","familyDefault"],["data-style-default","styleDefault"],["data-replacement-class","replacementClass"],["data-auto-replace-svg","autoReplaceSvg"],["data-auto-add-css","autoAddCss"],["data-search-pseudo-elements","searchPseudoElements"],["data-search-pseudo-elements-warnings","searchPseudoElementsWarnings"],["data-search-pseudo-elements-full-scan","searchPseudoElementsFullScan"],["data-observe-mutations","observeMutations"],["data-mutate-approach","mutateApproach"],["data-keep-original-source","keepOriginalSource"],["data-measure-performance","measurePerformance"],["data-show-missing-icons","showMissingIcons"]];Dn.forEach(function(a){var e=da(a,2),t=e[0],r=e[1],n=jn(_n(t));n!=null&&(K[r]=n)})}var ut={styleDefault:"solid",familyDefault:z,cssPrefix:it,replacementClass:st,autoReplaceSvg:!0,autoAddCss:!0,searchPseudoElements:!1,searchPseudoElementsWarnings:!0,searchPseudoElementsFullScan:!1,observeMutations:!0,mutateApproach:"async",keepOriginalSource:!0,measurePerformance:!1,showMissingIcons:!0};K.familyPrefix&&(K.cssPrefix=K.familyPrefix);var G=f(f({},ut),K);G.autoReplaceSvg||(G.observeMutations=!1);var m={};Object.keys(ut).forEach(function(a){Object.defineProperty(m,a,{enumerable:!0,set:function(t){G[a]=t,q.forEach(function(r){return r(m)})},get:function(){return G[a]}})});Object.defineProperty(m,"familyPrefix",{enumerable:!0,set:function(e){G.cssPrefix=e,q.forEach(function(t){return t(m)})},get:function(){return G.cssPrefix}});_.FontAwesomeConfig=m;var q=[];function $n(a){return q.push(a),function(){q.splice(q.indexOf(a),1)}}var W=Ca,P={size:16,x:0,y:0,rotate:0,flipX:!1,flipY:!1};function Rn(a){if(!(!a||!T)){var e=x.createElement("style");e.setAttribute("type","text/css"),e.innerHTML=a;for(var t=x.head.childNodes,r=null,n=t.length-1;n>-1;n--){var i=t[n],s=(i.tagName||"").toUpperCase();["STYLE","LINK"].indexOf(s)>-1&&(r=i)}return x.head.insertBefore(e,r),a}}var Un="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";function oe(){for(var a=12,e="";a-- >0;)e+=Un[Math.random()*62|0];return e}function V(a){for(var e=[],t=(a||[]).length>>>0;t--;)e[t]=a[t];return e}function Ba(a){return a.classList?V(a.classList):(a.getAttribute("class")||"").split(" ").filter(function(e){return e})}function dt(a){return"".concat(a).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Wn(a){return Object.keys(a||{}).reduce(function(e,t){return e+"".concat(t,'="').concat(dt(a[t]),'" ')},"").trim()}function ma(a){return Object.keys(a||{}).reduce(function(e,t){return e+"".concat(t,": ").concat(a[t].trim(),";")},"")}function Ga(a){return a.size!==P.size||a.x!==P.x||a.y!==P.y||a.rotate!==P.rotate||a.flipX||a.flipY}function Yn(a){var e=a.transform,t=a.containerWidth,r=a.iconWidth,n={transform:"translate(".concat(t/2," 256)")},i="translate(".concat(e.x*32,", ").concat(e.y*32,") "),s="scale(".concat(e.size/16*(e.flipX?-1:1),", ").concat(e.size/16*(e.flipY?-1:1),") "),o="rotate(".concat(e.rotate," 0 0)"),l={transform:"".concat(i," ").concat(s," ").concat(o)},c={transform:"translate(".concat(r/2*-1," -256)")};return{outer:n,inner:l,path:c}}function Hn(a){var e=a.transform,t=a.width,r=t===void 0?Ca:t,n=a.height,i=n===void 0?Ca:n,s="";return _e?s+="translate(".concat(e.x/W-r/2,"em, ").concat(e.y/W-i/2,"em) "):s+="translate(calc(-50% + ".concat(e.x/W,"em), calc(-50% + ").concat(e.y/W,"em)) "),s+="scale(".concat(e.size/W*(e.flipX?-1:1),", ").concat(e.size/W*(e.flipY?-1:1),") "),s+="rotate(".concat(e.rotate,"deg) "),s}var Bn=`:root, :host {
  --fa-font-solid: normal 900 1em/1 "Font Awesome 7 Free";
  --fa-font-regular: normal 400 1em/1 "Font Awesome 7 Free";
  --fa-font-light: normal 300 1em/1 "Font Awesome 7 Pro";
  --fa-font-thin: normal 100 1em/1 "Font Awesome 7 Pro";
  --fa-font-duotone: normal 900 1em/1 "Font Awesome 7 Duotone";
  --fa-font-duotone-regular: normal 400 1em/1 "Font Awesome 7 Duotone";
  --fa-font-duotone-light: normal 300 1em/1 "Font Awesome 7 Duotone";
  --fa-font-duotone-thin: normal 100 1em/1 "Font Awesome 7 Duotone";
  --fa-font-brands: normal 400 1em/1 "Font Awesome 7 Brands";
  --fa-font-sharp-solid: normal 900 1em/1 "Font Awesome 7 Sharp";
  --fa-font-sharp-regular: normal 400 1em/1 "Font Awesome 7 Sharp";
  --fa-font-sharp-light: normal 300 1em/1 "Font Awesome 7 Sharp";
  --fa-font-sharp-thin: normal 100 1em/1 "Font Awesome 7 Sharp";
  --fa-font-sharp-duotone-solid: normal 900 1em/1 "Font Awesome 7 Sharp Duotone";
  --fa-font-sharp-duotone-regular: normal 400 1em/1 "Font Awesome 7 Sharp Duotone";
  --fa-font-sharp-duotone-light: normal 300 1em/1 "Font Awesome 7 Sharp Duotone";
  --fa-font-sharp-duotone-thin: normal 100 1em/1 "Font Awesome 7 Sharp Duotone";
  --fa-font-slab-regular: normal 400 1em/1 "Font Awesome 7 Slab";
  --fa-font-slab-press-regular: normal 400 1em/1 "Font Awesome 7 Slab Press";
  --fa-font-whiteboard-semibold: normal 600 1em/1 "Font Awesome 7 Whiteboard";
  --fa-font-thumbprint-light: normal 300 1em/1 "Font Awesome 7 Thumbprint";
  --fa-font-notdog-solid: normal 900 1em/1 "Font Awesome 7 Notdog";
  --fa-font-notdog-duo-solid: normal 900 1em/1 "Font Awesome 7 Notdog Duo";
  --fa-font-etch-solid: normal 900 1em/1 "Font Awesome 7 Etch";
  --fa-font-jelly-regular: normal 400 1em/1 "Font Awesome 7 Jelly";
  --fa-font-jelly-fill-regular: normal 400 1em/1 "Font Awesome 7 Jelly Fill";
  --fa-font-jelly-duo-regular: normal 400 1em/1 "Font Awesome 7 Jelly Duo";
  --fa-font-chisel-regular: normal 400 1em/1 "Font Awesome 7 Chisel";
  --fa-font-utility-semibold: normal 600 1em/1 "Font Awesome 7 Utility";
  --fa-font-utility-duo-semibold: normal 600 1em/1 "Font Awesome 7 Utility Duo";
  --fa-font-utility-fill-semibold: normal 600 1em/1 "Font Awesome 7 Utility Fill";
}

.svg-inline--fa {
  box-sizing: content-box;
  display: var(--fa-display, inline-block);
  height: 1em;
  overflow: visible;
  vertical-align: -0.125em;
  width: var(--fa-width, 1.25em);
}
.svg-inline--fa.fa-2xs {
  vertical-align: 0.1em;
}
.svg-inline--fa.fa-xs {
  vertical-align: 0em;
}
.svg-inline--fa.fa-sm {
  vertical-align: -0.0714285714em;
}
.svg-inline--fa.fa-lg {
  vertical-align: -0.2em;
}
.svg-inline--fa.fa-xl {
  vertical-align: -0.25em;
}
.svg-inline--fa.fa-2xl {
  vertical-align: -0.3125em;
}
.svg-inline--fa.fa-pull-left,
.svg-inline--fa .fa-pull-start {
  float: inline-start;
  margin-inline-end: var(--fa-pull-margin, 0.3em);
}
.svg-inline--fa.fa-pull-right,
.svg-inline--fa .fa-pull-end {
  float: inline-end;
  margin-inline-start: var(--fa-pull-margin, 0.3em);
}
.svg-inline--fa.fa-li {
  width: var(--fa-li-width, 2em);
  inset-inline-start: calc(-1 * var(--fa-li-width, 2em));
  inset-block-start: 0.25em; /* syncing vertical alignment with Web Font rendering */
}

.fa-layers-counter, .fa-layers-text {
  display: inline-block;
  position: absolute;
  text-align: center;
}

.fa-layers {
  display: inline-block;
  height: 1em;
  position: relative;
  text-align: center;
  vertical-align: -0.125em;
  width: var(--fa-width, 1.25em);
}
.fa-layers .svg-inline--fa {
  inset: 0;
  margin: auto;
  position: absolute;
  transform-origin: center center;
}

.fa-layers-text {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  transform-origin: center center;
}

.fa-layers-counter {
  background-color: var(--fa-counter-background-color, #ff253a);
  border-radius: var(--fa-counter-border-radius, 1em);
  box-sizing: border-box;
  color: var(--fa-inverse, #fff);
  line-height: var(--fa-counter-line-height, 1);
  max-width: var(--fa-counter-max-width, 5em);
  min-width: var(--fa-counter-min-width, 1.5em);
  overflow: hidden;
  padding: var(--fa-counter-padding, 0.25em 0.5em);
  right: var(--fa-right, 0);
  text-overflow: ellipsis;
  top: var(--fa-top, 0);
  transform: scale(var(--fa-counter-scale, 0.25));
  transform-origin: top right;
}

.fa-layers-bottom-right {
  bottom: var(--fa-bottom, 0);
  right: var(--fa-right, 0);
  top: auto;
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: bottom right;
}

.fa-layers-bottom-left {
  bottom: var(--fa-bottom, 0);
  left: var(--fa-left, 0);
  right: auto;
  top: auto;
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: bottom left;
}

.fa-layers-top-right {
  top: var(--fa-top, 0);
  right: var(--fa-right, 0);
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: top right;
}

.fa-layers-top-left {
  left: var(--fa-left, 0);
  right: auto;
  top: var(--fa-top, 0);
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: top left;
}

.fa-1x {
  font-size: 1em;
}

.fa-2x {
  font-size: 2em;
}

.fa-3x {
  font-size: 3em;
}

.fa-4x {
  font-size: 4em;
}

.fa-5x {
  font-size: 5em;
}

.fa-6x {
  font-size: 6em;
}

.fa-7x {
  font-size: 7em;
}

.fa-8x {
  font-size: 8em;
}

.fa-9x {
  font-size: 9em;
}

.fa-10x {
  font-size: 10em;
}

.fa-2xs {
  font-size: calc(10 / 16 * 1em); /* converts a 10px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 10 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 10 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-xs {
  font-size: calc(12 / 16 * 1em); /* converts a 12px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 12 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 12 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-sm {
  font-size: calc(14 / 16 * 1em); /* converts a 14px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 14 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 14 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-lg {
  font-size: calc(20 / 16 * 1em); /* converts a 20px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 20 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 20 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-xl {
  font-size: calc(24 / 16 * 1em); /* converts a 24px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 24 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 24 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-2xl {
  font-size: calc(32 / 16 * 1em); /* converts a 32px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 32 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 32 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-width-auto {
  --fa-width: auto;
}

.fa-fw,
.fa-width-fixed {
  --fa-width: 1.25em;
}

.fa-ul {
  list-style-type: none;
  margin-inline-start: var(--fa-li-margin, 2.5em);
  padding-inline-start: 0;
}
.fa-ul > li {
  position: relative;
}

.fa-li {
  inset-inline-start: calc(-1 * var(--fa-li-width, 2em));
  position: absolute;
  text-align: center;
  width: var(--fa-li-width, 2em);
  line-height: inherit;
}

/* Heads Up: Bordered Icons will not be supported in the future!
  - This feature will be deprecated in the next major release of Font Awesome (v8)!
  - You may continue to use it in this version *v7), but it will not be supported in Font Awesome v8.
*/
/* Notes:
* --@{v.$css-prefix}-border-width = 1/16 by default (to render as ~1px based on a 16px default font-size)
* --@{v.$css-prefix}-border-padding =
  ** 3/16 for vertical padding (to give ~2px of vertical whitespace around an icon considering it's vertical alignment)
  ** 4/16 for horizontal padding (to give ~4px of horizontal whitespace around an icon)
*/
.fa-border {
  border-color: var(--fa-border-color, #eee);
  border-radius: var(--fa-border-radius, 0.1em);
  border-style: var(--fa-border-style, solid);
  border-width: var(--fa-border-width, 0.0625em);
  box-sizing: var(--fa-border-box-sizing, content-box);
  padding: var(--fa-border-padding, 0.1875em 0.25em);
}

.fa-pull-left,
.fa-pull-start {
  float: inline-start;
  margin-inline-end: var(--fa-pull-margin, 0.3em);
}

.fa-pull-right,
.fa-pull-end {
  float: inline-end;
  margin-inline-start: var(--fa-pull-margin, 0.3em);
}

.fa-beat {
  animation-name: fa-beat;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-bounce {
  animation-name: fa-bounce;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));
}

.fa-fade {
  animation-name: fa-fade;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.4, 0, 0.6, 1));
}

.fa-beat-fade {
  animation-name: fa-beat-fade;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.4, 0, 0.6, 1));
}

.fa-flip {
  animation-name: fa-flip;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-shake {
  animation-name: fa-shake;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-spin {
  animation-name: fa-spin;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 2s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-spin-reverse {
  --fa-animation-direction: reverse;
}

.fa-pulse,
.fa-spin-pulse {
  animation-name: fa-spin;
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, steps(8));
}

@media (prefers-reduced-motion: reduce) {
  .fa-beat,
  .fa-bounce,
  .fa-fade,
  .fa-beat-fade,
  .fa-flip,
  .fa-pulse,
  .fa-shake,
  .fa-spin,
  .fa-spin-pulse {
    animation: none !important;
    transition: none !important;
  }
}
@keyframes fa-beat {
  0%, 90% {
    transform: scale(1);
  }
  45% {
    transform: scale(var(--fa-beat-scale, 1.25));
  }
}
@keyframes fa-bounce {
  0% {
    transform: scale(1, 1) translateY(0);
  }
  10% {
    transform: scale(var(--fa-bounce-start-scale-x, 1.1), var(--fa-bounce-start-scale-y, 0.9)) translateY(0);
  }
  30% {
    transform: scale(var(--fa-bounce-jump-scale-x, 0.9), var(--fa-bounce-jump-scale-y, 1.1)) translateY(var(--fa-bounce-height, -0.5em));
  }
  50% {
    transform: scale(var(--fa-bounce-land-scale-x, 1.05), var(--fa-bounce-land-scale-y, 0.95)) translateY(0);
  }
  57% {
    transform: scale(1, 1) translateY(var(--fa-bounce-rebound, -0.125em));
  }
  64% {
    transform: scale(1, 1) translateY(0);
  }
  100% {
    transform: scale(1, 1) translateY(0);
  }
}
@keyframes fa-fade {
  50% {
    opacity: var(--fa-fade-opacity, 0.4);
  }
}
@keyframes fa-beat-fade {
  0%, 100% {
    opacity: var(--fa-beat-fade-opacity, 0.4);
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(var(--fa-beat-fade-scale, 1.125));
  }
}
@keyframes fa-flip {
  50% {
    transform: rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -180deg));
  }
}
@keyframes fa-shake {
  0% {
    transform: rotate(-15deg);
  }
  4% {
    transform: rotate(15deg);
  }
  8%, 24% {
    transform: rotate(-18deg);
  }
  12%, 28% {
    transform: rotate(18deg);
  }
  16% {
    transform: rotate(-22deg);
  }
  20% {
    transform: rotate(22deg);
  }
  32% {
    transform: rotate(-12deg);
  }
  36% {
    transform: rotate(12deg);
  }
  40%, 100% {
    transform: rotate(0deg);
  }
}
@keyframes fa-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.fa-rotate-90 {
  transform: rotate(90deg);
}

.fa-rotate-180 {
  transform: rotate(180deg);
}

.fa-rotate-270 {
  transform: rotate(270deg);
}

.fa-flip-horizontal {
  transform: scale(-1, 1);
}

.fa-flip-vertical {
  transform: scale(1, -1);
}

.fa-flip-both,
.fa-flip-horizontal.fa-flip-vertical {
  transform: scale(-1, -1);
}

.fa-rotate-by {
  transform: rotate(var(--fa-rotate-angle, 0));
}

.svg-inline--fa .fa-primary {
  fill: var(--fa-primary-color, currentColor);
  opacity: var(--fa-primary-opacity, 1);
}

.svg-inline--fa .fa-secondary {
  fill: var(--fa-secondary-color, currentColor);
  opacity: var(--fa-secondary-opacity, 0.4);
}

.svg-inline--fa.fa-swap-opacity .fa-primary {
  opacity: var(--fa-secondary-opacity, 0.4);
}

.svg-inline--fa.fa-swap-opacity .fa-secondary {
  opacity: var(--fa-primary-opacity, 1);
}

.svg-inline--fa mask .fa-primary,
.svg-inline--fa mask .fa-secondary {
  fill: black;
}

.svg-inline--fa.fa-inverse {
  fill: var(--fa-inverse, #fff);
}

.fa-stack {
  display: inline-block;
  height: 2em;
  line-height: 2em;
  position: relative;
  vertical-align: middle;
  width: 2.5em;
}

.fa-inverse {
  color: var(--fa-inverse, #fff);
}

.svg-inline--fa.fa-stack-1x {
  --fa-width: 1.25em;
  height: 1em;
  width: var(--fa-width);
}
.svg-inline--fa.fa-stack-2x {
  --fa-width: 2.5em;
  height: 2em;
  width: var(--fa-width);
}

.fa-stack-1x,
.fa-stack-2x {
  inset: 0;
  margin: auto;
  position: absolute;
  z-index: var(--fa-stack-z-index, auto);
}`;function mt(){var a=it,e=st,t=m.cssPrefix,r=m.replacementClass,n=Bn;if(t!==a||r!==e){var i=new RegExp("\\.".concat(a,"\\-"),"g"),s=new RegExp("\\--".concat(a,"\\-"),"g"),o=new RegExp("\\.".concat(e),"g");n=n.replace(i,".".concat(t,"-")).replace(s,"--".concat(t,"-")).replace(o,".".concat(r))}return n}var le=!1;function Sa(){m.autoAddCss&&!le&&(Rn(mt()),le=!0)}var Gn={mixout:function(){return{dom:{css:mt,insertCss:Sa}}},hooks:function(){return{beforeDOMElementCreation:function(){Sa()},beforeI2svg:function(){Sa()}}}},O=_||{};O[F]||(O[F]={});O[F].styles||(O[F].styles={});O[F].hooks||(O[F].hooks={});O[F].shims||(O[F].shims=[]);var C=O[F],vt=[],pt=function(){x.removeEventListener("DOMContentLoaded",pt),ca=1,vt.map(function(e){return e()})},ca=!1;T&&(ca=(x.documentElement.doScroll?/^loaded|^c/:/^loaded|^i|^c/).test(x.readyState),ca||x.addEventListener("DOMContentLoaded",pt));function Vn(a){T&&(ca?setTimeout(a,0):vt.push(a))}function ta(a){var e=a.tag,t=a.attributes,r=t===void 0?{}:t,n=a.children,i=n===void 0?[]:n;return typeof a=="string"?dt(a):"<".concat(e," ").concat(Wn(r),">").concat(i.map(ta).join(""),"</").concat(e,">")}function fe(a,e,t){if(a&&a[e]&&a[e][t])return{prefix:e,iconName:t,icon:a[e][t]}}var wa=function(e,t,r,n){var i=Object.keys(e),s=i.length,o=t,l,c,u;for(r===void 0?(l=1,u=e[i[0]]):(l=0,u=r);l<s;l++)c=i[l],u=o(u,e[c],c,e);return u};function ht(a){return M(a).length!==1?null:a.codePointAt(0).toString(16)}function ce(a){return Object.keys(a).reduce(function(e,t){var r=a[t],n=!!r.icon;return n?e[r.iconName]=r.icon:e[t]=r,e},{})}function Ea(a,e){var t=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},r=t.skipHooks,n=r===void 0?!1:r,i=ce(e);typeof C.hooks.addPack=="function"&&!n?C.hooks.addPack(a,ce(e)):C.styles[a]=f(f({},C.styles[a]||{}),i),a==="fas"&&Ea("fa",e)}var Q=C.styles,Xn=C.shims,gt=Object.keys(Ha),Kn=gt.reduce(function(a,e){return a[e]=Object.keys(Ha[e]),a},{}),Va=null,bt={},yt={},xt={},St={},wt={};function qn(a){return~Tn.indexOf(a)}function Jn(a,e){var t=e.split("-"),r=t[0],n=t.slice(1).join("-");return r===a&&n!==""&&!qn(n)?n:null}var At=function(){var e=function(i){return wa(Q,function(s,o,l){return s[l]=wa(o,i,{}),s},{})};bt=e(function(n,i,s){if(i[3]&&(n[i[3]]=s),i[2]){var o=i[2].filter(function(l){return typeof l=="number"});o.forEach(function(l){n[l.toString(16)]=s})}return n}),yt=e(function(n,i,s){if(n[s]=s,i[2]){var o=i[2].filter(function(l){return typeof l=="string"});o.forEach(function(l){n[l]=s})}return n}),wt=e(function(n,i,s){var o=i[2];return n[s]=s,o.forEach(function(l){n[l]=s}),n});var t="far"in Q||m.autoFetchSvg,r=wa(Xn,function(n,i){var s=i[0],o=i[1],l=i[2];return o==="far"&&!t&&(o="fas"),typeof s=="string"&&(n.names[s]={prefix:o,iconName:l}),typeof s=="number"&&(n.unicodes[s.toString(16)]={prefix:o,iconName:l}),n},{names:{},unicodes:{}});xt=r.names,St=r.unicodes,Va=va(m.styleDefault,{family:m.familyDefault})};$n(function(a){Va=va(a.styleDefault,{family:m.familyDefault})});At();function Xa(a,e){return(bt[a]||{})[e]}function Qn(a,e){return(yt[a]||{})[e]}function $(a,e){return(wt[a]||{})[e]}function kt(a){return xt[a]||{prefix:null,iconName:null}}function Zn(a){var e=St[a],t=Xa("fas",a);return e||(t?{prefix:"fas",iconName:t}:null)||{prefix:null,iconName:null}}function j(){return Va}var zt=function(){return{prefix:null,iconName:null,rest:[]}};function ai(a){var e=z,t=gt.reduce(function(r,n){return r[n]="".concat(m.cssPrefix,"-").concat(n),r},{});return et.forEach(function(r){(a.includes(t[r])||a.some(function(n){return Kn[r].includes(n)}))&&(e=r)}),e}function va(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},t=e.family,r=t===void 0?z:t,n=In[r][a];if(r===aa&&!a)return"fad";var i=se[r][a]||se[r][n],s=a in C.styles?a:null,o=i||s||null;return o}function ei(a){var e=[],t=null;return a.forEach(function(r){var n=Jn(m.cssPrefix,r);n?t=n:r&&e.push(r)}),{iconName:t,rest:e}}function ue(a){return a.sort().filter(function(e,t,r){return r.indexOf(e)===t})}var de=rt.concat(tt);function pa(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},t=e.skipLookups,r=t===void 0?!1:t,n=null,i=ue(a.filter(function(v){return de.includes(v)})),s=ue(a.filter(function(v){return!de.includes(v)})),o=i.filter(function(v){return n=v,!De.includes(v)}),l=da(o,1),c=l[0],u=c===void 0?null:c,d=ai(i),h=f(f({},ei(s)),{},{prefix:va(u,{family:d})});return f(f(f({},h),ii({values:a,family:d,styles:Q,config:m,canonical:h,givenPrefix:n})),ti(r,n,h))}function ti(a,e,t){var r=t.prefix,n=t.iconName;if(a||!r||!n)return{prefix:r,iconName:n};var i=e==="fa"?kt(n):{},s=$(r,n);return n=i.iconName||s||n,r=i.prefix||r,r==="far"&&!Q.far&&Q.fas&&!m.autoFetchSvg&&(r="fas"),{prefix:r,iconName:n}}var ri=et.filter(function(a){return a!==z||a!==aa}),ni=Object.keys(La).filter(function(a){return a!==z}).map(function(a){return Object.keys(La[a])}).flat();function ii(a){var e=a.values,t=a.family,r=a.canonical,n=a.givenPrefix,i=n===void 0?"":n,s=a.styles,o=s===void 0?{}:s,l=a.config,c=l===void 0?{}:l,u=t===aa,d=e.includes("fa-duotone")||e.includes("fad"),h=c.familyDefault==="duotone",v=r.prefix==="fad"||r.prefix==="fa-duotone";if(!u&&(d||h||v)&&(r.prefix="fad"),(e.includes("fa-brands")||e.includes("fab"))&&(r.prefix="fab"),!r.prefix&&ri.includes(t)){var y=Object.keys(o).find(function(S){return ni.includes(S)});if(y||c.autoFetchSvg){var b=Sr.get(t).defaultShortPrefixId;r.prefix=b,r.iconName=$(r.prefix,r.iconName)||r.iconName}}return(r.prefix==="fa"||i==="fa")&&(r.prefix=j()||"fas"),r}var si=(function(){function a(){Yt(this,a),this.definitions={}}return Bt(a,[{key:"add",value:function(){for(var t=this,r=arguments.length,n=new Array(r),i=0;i<r;i++)n[i]=arguments[i];var s=n.reduce(this._pullDefinitions,{});Object.keys(s).forEach(function(o){t.definitions[o]=f(f({},t.definitions[o]||{}),s[o]),Ea(o,s[o]);var l=Ha[z][o];l&&Ea(l,s[o]),At()})}},{key:"reset",value:function(){this.definitions={}}},{key:"_pullDefinitions",value:function(t,r){var n=r.prefix&&r.iconName&&r.icon?{0:r}:r;return Object.keys(n).map(function(i){var s=n[i],o=s.prefix,l=s.iconName,c=s.icon,u=c[2];t[o]||(t[o]={}),u.length>0&&u.forEach(function(d){typeof d=="string"&&(t[o][d]=c)}),t[o][l]=c}),t}}])})(),me=[],H={},B={},oi=Object.keys(B);function li(a,e){var t=e.mixoutsTo;return me=a,H={},Object.keys(B).forEach(function(r){oi.indexOf(r)===-1&&delete B[r]}),me.forEach(function(r){var n=r.mixout?r.mixout():{};if(Object.keys(n).forEach(function(s){typeof n[s]=="function"&&(t[s]=n[s]),fa(n[s])==="object"&&Object.keys(n[s]).forEach(function(o){t[s]||(t[s]={}),t[s][o]=n[s][o]})}),r.hooks){var i=r.hooks();Object.keys(i).forEach(function(s){H[s]||(H[s]=[]),H[s].push(i[s])})}r.provides&&r.provides(B)}),t}function Fa(a,e){for(var t=arguments.length,r=new Array(t>2?t-2:0),n=2;n<t;n++)r[n-2]=arguments[n];var i=H[a]||[];return i.forEach(function(s){e=s.apply(null,[e].concat(r))}),e}function U(a){for(var e=arguments.length,t=new Array(e>1?e-1:0),r=1;r<e;r++)t[r-1]=arguments[r];var n=H[a]||[];n.forEach(function(i){i.apply(null,t)})}function D(){var a=arguments[0],e=Array.prototype.slice.call(arguments,1);return B[a]?B[a].apply(null,e):void 0}function Oa(a){a.prefix==="fa"&&(a.prefix="fas");var e=a.iconName,t=a.prefix||j();if(e)return e=$(t,e)||e,fe(Lt.definitions,t,e)||fe(C.styles,t,e)}var Lt=new si,fi=function(){m.autoReplaceSvg=!1,m.observeMutations=!1,U("noAuto")},ci={i2svg:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return T?(U("beforeI2svg",e),D("pseudoElements2svg",e),D("i2svg",e)):Promise.reject(new Error("Operation requires a DOM of some kind."))},watch:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=e.autoReplaceSvgRoot;m.autoReplaceSvg===!1&&(m.autoReplaceSvg=!0),m.observeMutations=!0,Vn(function(){di({autoReplaceSvgRoot:t}),U("watch",e)})}},ui={icon:function(e){if(e===null)return null;if(fa(e)==="object"&&e.prefix&&e.iconName)return{prefix:e.prefix,iconName:$(e.prefix,e.iconName)||e.iconName};if(Array.isArray(e)&&e.length===2){var t=e[1].indexOf("fa-")===0?e[1].slice(3):e[1],r=va(e[0]);return{prefix:r,iconName:$(r,t)||t}}if(typeof e=="string"&&(e.indexOf("".concat(m.cssPrefix,"-"))>-1||e.match(Nn))){var n=pa(e.split(" "),{skipLookups:!0});return{prefix:n.prefix||j(),iconName:$(n.prefix,n.iconName)||n.iconName}}if(typeof e=="string"){var i=j();return{prefix:i,iconName:$(i,e)||e}}}},L={noAuto:fi,config:m,dom:ci,parse:ui,library:Lt,findIconDefinition:Oa,toHtml:ta},di=function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=e.autoReplaceSvgRoot,r=t===void 0?x:t;(Object.keys(C.styles).length>0||m.autoFetchSvg)&&T&&m.autoReplaceSvg&&L.dom.i2svg({node:r})};function ha(a,e){return Object.defineProperty(a,"abstract",{get:e}),Object.defineProperty(a,"html",{get:function(){return a.abstract.map(function(r){return ta(r)})}}),Object.defineProperty(a,"node",{get:function(){if(T){var r=x.createElement("div");return r.innerHTML=a.html,r.children}}}),a}function mi(a){var e=a.children,t=a.main,r=a.mask,n=a.attributes,i=a.styles,s=a.transform;if(Ga(s)&&t.found&&!r.found){var o=t.width,l=t.height,c={x:o/l/2,y:.5};n.style=ma(f(f({},i),{},{"transform-origin":"".concat(c.x+s.x/16,"em ").concat(c.y+s.y/16,"em")}))}return[{tag:"svg",attributes:n,children:e}]}function vi(a){var e=a.prefix,t=a.iconName,r=a.children,n=a.attributes,i=a.symbol,s=i===!0?"".concat(e,"-").concat(m.cssPrefix,"-").concat(t):i;return[{tag:"svg",attributes:{style:"display: none;"},children:[{tag:"symbol",attributes:f(f({},n),{},{id:s}),children:r}]}]}function pi(a){var e=["aria-label","aria-labelledby","title","role"];return e.some(function(t){return t in a})}function Ka(a){var e=a.icons,t=e.main,r=e.mask,n=a.prefix,i=a.iconName,s=a.transform,o=a.symbol,l=a.maskId,c=a.extra,u=a.watchable,d=u===void 0?!1:u,h=r.found?r:t,v=h.width,y=h.height,b=[m.replacementClass,i?"".concat(m.cssPrefix,"-").concat(i):""].filter(function(g){return c.classes.indexOf(g)===-1}).filter(function(g){return g!==""||!!g}).concat(c.classes).join(" "),S={children:[],attributes:f(f({},c.attributes),{},{"data-prefix":n,"data-icon":i,class:b,role:c.attributes.role||"img",viewBox:"0 0 ".concat(v," ").concat(y)})};!pi(c.attributes)&&!c.attributes["aria-hidden"]&&(S.attributes["aria-hidden"]="true"),d&&(S.attributes[R]="");var w=f(f({},S),{},{prefix:n,iconName:i,main:t,mask:r,maskId:l,transform:s,symbol:o,styles:f({},c.styles)}),A=r.found&&t.found?D("generateAbstractMask",w)||{children:[],attributes:{}}:D("generateAbstractIcon",w)||{children:[],attributes:{}},k=A.children,I=A.attributes;return w.children=k,w.attributes=I,o?vi(w):mi(w)}function ve(a){var e=a.content,t=a.width,r=a.height,n=a.transform,i=a.extra,s=a.watchable,o=s===void 0?!1:s,l=f(f({},i.attributes),{},{class:i.classes.join(" ")});o&&(l[R]="");var c=f({},i.styles);Ga(n)&&(c.transform=Hn({transform:n,width:t,height:r}),c["-webkit-transform"]=c.transform);var u=ma(c);u.length>0&&(l.style=u);var d=[];return d.push({tag:"span",attributes:l,children:[e]}),d}function hi(a){var e=a.content,t=a.extra,r=f(f({},t.attributes),{},{class:t.classes.join(" ")}),n=ma(t.styles);n.length>0&&(r.style=n);var i=[];return i.push({tag:"span",attributes:r,children:[e]}),i}var Aa=C.styles;function Ta(a){var e=a[0],t=a[1],r=a.slice(4),n=da(r,1),i=n[0],s=null;return Array.isArray(i)?s={tag:"g",attributes:{class:"".concat(m.cssPrefix,"-").concat(xa.GROUP)},children:[{tag:"path",attributes:{class:"".concat(m.cssPrefix,"-").concat(xa.SECONDARY),fill:"currentColor",d:i[0]}},{tag:"path",attributes:{class:"".concat(m.cssPrefix,"-").concat(xa.PRIMARY),fill:"currentColor",d:i[1]}}]}:s={tag:"path",attributes:{fill:"currentColor",d:i}},{found:!0,width:e,height:t,icon:s}}var gi={found:!1,width:512,height:512};function bi(a,e){!lt&&!m.showMissingIcons&&a&&console.error('Icon with name "'.concat(a,'" and prefix "').concat(e,'" is missing.'))}function _a(a,e){var t=e;return e==="fa"&&m.styleDefault!==null&&(e=j()),new Promise(function(r,n){if(t==="fa"){var i=kt(a)||{};a=i.iconName||a,e=i.prefix||e}if(a&&e&&Aa[e]&&Aa[e][a]){var s=Aa[e][a];return r(Ta(s))}bi(a,e),r(f(f({},gi),{},{icon:m.showMissingIcons&&a?D("missingIconAbstract")||{}:{}}))})}var pe=function(){},ja=m.measurePerformance&&na&&na.mark&&na.measure?na:{mark:pe,measure:pe},X='FA "7.1.0"',yi=function(e){return ja.mark("".concat(X," ").concat(e," begins")),function(){return Ct(e)}},Ct=function(e){ja.mark("".concat(X," ").concat(e," ends")),ja.measure("".concat(X," ").concat(e),"".concat(X," ").concat(e," begins"),"".concat(X," ").concat(e," ends"))},qa={begin:yi,end:Ct},oa=function(){};function he(a){var e=a.getAttribute?a.getAttribute(R):null;return typeof e=="string"}function xi(a){var e=a.getAttribute?a.getAttribute(Wa):null,t=a.getAttribute?a.getAttribute(Ya):null;return e&&t}function Si(a){return a&&a.classList&&a.classList.contains&&a.classList.contains(m.replacementClass)}function wi(){if(m.autoReplaceSvg===!0)return la.replace;var a=la[m.autoReplaceSvg];return a||la.replace}function Ai(a){return x.createElementNS("http://www.w3.org/2000/svg",a)}function ki(a){return x.createElement(a)}function Mt(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},t=e.ceFn,r=t===void 0?a.tag==="svg"?Ai:ki:t;if(typeof a=="string")return x.createTextNode(a);var n=r(a.tag);Object.keys(a.attributes||[]).forEach(function(s){n.setAttribute(s,a.attributes[s])});var i=a.children||[];return i.forEach(function(s){n.appendChild(Mt(s,{ceFn:r}))}),n}function zi(a){var e=" ".concat(a.outerHTML," ");return e="".concat(e,"Font Awesome fontawesome.com "),e}var la={replace:function(e){var t=e[0];if(t.parentNode)if(e[1].forEach(function(n){t.parentNode.insertBefore(Mt(n),t)}),t.getAttribute(R)===null&&m.keepOriginalSource){var r=x.createComment(zi(t));t.parentNode.replaceChild(r,t)}else t.remove()},nest:function(e){var t=e[0],r=e[1];if(~Ba(t).indexOf(m.replacementClass))return la.replace(e);var n=new RegExp("".concat(m.cssPrefix,"-.*"));if(delete r[0].attributes.id,r[0].attributes.class){var i=r[0].attributes.class.split(" ").reduce(function(o,l){return l===m.replacementClass||l.match(n)?o.toSvg.push(l):o.toNode.push(l),o},{toNode:[],toSvg:[]});r[0].attributes.class=i.toSvg.join(" "),i.toNode.length===0?t.removeAttribute("class"):t.setAttribute("class",i.toNode.join(" "))}var s=r.map(function(o){return ta(o)}).join(`
`);t.setAttribute(R,""),t.innerHTML=s}};function ge(a){a()}function Pt(a,e){var t=typeof e=="function"?e:oa;if(a.length===0)t();else{var r=ge;m.mutateApproach===Mn&&(r=_.requestAnimationFrame||ge),r(function(){var n=wi(),i=qa.begin("mutate");a.map(n),i(),t()})}}var Ja=!1;function It(){Ja=!0}function Da(){Ja=!1}var ua=null;function be(a){if(te&&m.observeMutations){var e=a.treeCallback,t=e===void 0?oa:e,r=a.nodeCallback,n=r===void 0?oa:r,i=a.pseudoElementsCallback,s=i===void 0?oa:i,o=a.observeMutationsRoot,l=o===void 0?x:o;ua=new te(function(c){if(!Ja){var u=j();V(c).forEach(function(d){if(d.type==="childList"&&d.addedNodes.length>0&&!he(d.addedNodes[0])&&(m.searchPseudoElements&&s(d.target),t(d.target)),d.type==="attributes"&&d.target.parentNode&&m.searchPseudoElements&&s([d.target],!0),d.type==="attributes"&&he(d.target)&&~On.indexOf(d.attributeName))if(d.attributeName==="class"&&xi(d.target)){var h=pa(Ba(d.target)),v=h.prefix,y=h.iconName;d.target.setAttribute(Wa,v||u),y&&d.target.setAttribute(Ya,y)}else Si(d.target)&&n(d.target)})}}),T&&ua.observe(l,{childList:!0,attributes:!0,characterData:!0,subtree:!0})}}function Li(){ua&&ua.disconnect()}function Ci(a){var e=a.getAttribute("style"),t=[];return e&&(t=e.split(";").reduce(function(r,n){var i=n.split(":"),s=i[0],o=i.slice(1);return s&&o.length>0&&(r[s]=o.join(":").trim()),r},{})),t}function Mi(a){var e=a.getAttribute("data-prefix"),t=a.getAttribute("data-icon"),r=a.innerText!==void 0?a.innerText.trim():"",n=pa(Ba(a));return n.prefix||(n.prefix=j()),e&&t&&(n.prefix=e,n.iconName=t),n.iconName&&n.prefix||(n.prefix&&r.length>0&&(n.iconName=Qn(n.prefix,a.innerText)||Xa(n.prefix,ht(a.innerText))),!n.iconName&&m.autoFetchSvg&&a.firstChild&&a.firstChild.nodeType===Node.TEXT_NODE&&(n.iconName=a.firstChild.data)),n}function Pi(a){var e=V(a.attributes).reduce(function(t,r){return t.name!=="class"&&t.name!=="style"&&(t[r.name]=r.value),t},{});return e}function Ii(){return{iconName:null,prefix:null,transform:P,symbol:!1,mask:{iconName:null,prefix:null,rest:[]},maskId:null,extra:{classes:[],styles:{},attributes:{}}}}function ye(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{styleParser:!0},t=Mi(a),r=t.iconName,n=t.prefix,i=t.rest,s=Pi(a),o=Fa("parseNodeAttributes",{},a),l=e.styleParser?Ci(a):[];return f({iconName:r,prefix:n,transform:P,mask:{iconName:null,prefix:null,rest:[]},maskId:null,symbol:!1,extra:{classes:i,styles:l,attributes:s}},o)}var Ni=C.styles;function Nt(a){var e=m.autoReplaceSvg==="nest"?ye(a,{styleParser:!1}):ye(a);return~e.extra.classes.indexOf(ct)?D("generateLayersText",a,e):D("generateSvgReplacementMutation",a,e)}function Ei(){return[].concat(M(tt),M(rt))}function xe(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;if(!T)return Promise.resolve();var t=x.documentElement.classList,r=function(d){return t.add("".concat(ie,"-").concat(d))},n=function(d){return t.remove("".concat(ie,"-").concat(d))},i=m.autoFetchSvg?Ei():De.concat(Object.keys(Ni));i.includes("fa")||i.push("fa");var s=[".".concat(ct,":not([").concat(R,"])")].concat(i.map(function(u){return".".concat(u,":not([").concat(R,"])")})).join(", ");if(s.length===0)return Promise.resolve();var o=[];try{o=V(a.querySelectorAll(s))}catch{}if(o.length>0)r("pending"),n("complete");else return Promise.resolve();var l=qa.begin("onTree"),c=o.reduce(function(u,d){try{var h=Nt(d);h&&u.push(h)}catch(v){lt||v.name==="MissingIcon"&&console.error(v)}return u},[]);return new Promise(function(u,d){Promise.all(c).then(function(h){Pt(h,function(){r("active"),r("complete"),n("pending"),typeof e=="function"&&e(),l(),u()})}).catch(function(h){l(),d(h)})})}function Fi(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;Nt(a).then(function(t){t&&Pt([t],e)})}function Oi(a){return function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},r=(e||{}).icon?e:Oa(e||{}),n=t.mask;return n&&(n=(n||{}).icon?n:Oa(n||{})),a(r,f(f({},t),{},{mask:n}))}}var Ti=function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},r=t.transform,n=r===void 0?P:r,i=t.symbol,s=i===void 0?!1:i,o=t.mask,l=o===void 0?null:o,c=t.maskId,u=c===void 0?null:c,d=t.classes,h=d===void 0?[]:d,v=t.attributes,y=v===void 0?{}:v,b=t.styles,S=b===void 0?{}:b;if(e){var w=e.prefix,A=e.iconName,k=e.icon;return ha(f({type:"icon"},e),function(){return U("beforeDOMElementCreation",{iconDefinition:e,params:t}),Ka({icons:{main:Ta(k),mask:l?Ta(l.icon):{found:!1,width:null,height:null,icon:{}}},prefix:w,iconName:A,transform:f(f({},P),n),symbol:s,maskId:u,extra:{attributes:y,styles:S,classes:h}})})}},_i={mixout:function(){return{icon:Oi(Ti)}},hooks:function(){return{mutationObserverCallbacks:function(t){return t.treeCallback=xe,t.nodeCallback=Fi,t}}},provides:function(e){e.i2svg=function(t){var r=t.node,n=r===void 0?x:r,i=t.callback,s=i===void 0?function(){}:i;return xe(n,s)},e.generateSvgReplacementMutation=function(t,r){var n=r.iconName,i=r.prefix,s=r.transform,o=r.symbol,l=r.mask,c=r.maskId,u=r.extra;return new Promise(function(d,h){Promise.all([_a(n,i),l.iconName?_a(l.iconName,l.prefix):Promise.resolve({found:!1,width:512,height:512,icon:{}})]).then(function(v){var y=da(v,2),b=y[0],S=y[1];d([t,Ka({icons:{main:b,mask:S},prefix:i,iconName:n,transform:s,symbol:o,maskId:c,extra:u,watchable:!0})])}).catch(h)})},e.generateAbstractIcon=function(t){var r=t.children,n=t.attributes,i=t.main,s=t.transform,o=t.styles,l=ma(o);l.length>0&&(n.style=l);var c;return Ga(s)&&(c=D("generateAbstractTransformGrouping",{main:i,transform:s,containerWidth:i.width,iconWidth:i.width})),r.push(c||i.icon),{children:r,attributes:n}}}},ji={mixout:function(){return{layer:function(t){var r=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=r.classes,i=n===void 0?[]:n;return ha({type:"layer"},function(){U("beforeDOMElementCreation",{assembler:t,params:r});var s=[];return t(function(o){Array.isArray(o)?o.map(function(l){s=s.concat(l.abstract)}):s=s.concat(o.abstract)}),[{tag:"span",attributes:{class:["".concat(m.cssPrefix,"-layers")].concat(M(i)).join(" ")},children:s}]})}}}},Di={mixout:function(){return{counter:function(t){var r=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{};r.title;var n=r.classes,i=n===void 0?[]:n,s=r.attributes,o=s===void 0?{}:s,l=r.styles,c=l===void 0?{}:l;return ha({type:"counter",content:t},function(){return U("beforeDOMElementCreation",{content:t,params:r}),hi({content:t.toString(),extra:{attributes:o,styles:c,classes:["".concat(m.cssPrefix,"-layers-counter")].concat(M(i))}})})}}}},$i={mixout:function(){return{text:function(t){var r=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=r.transform,i=n===void 0?P:n,s=r.classes,o=s===void 0?[]:s,l=r.attributes,c=l===void 0?{}:l,u=r.styles,d=u===void 0?{}:u;return ha({type:"text",content:t},function(){return U("beforeDOMElementCreation",{content:t,params:r}),ve({content:t,transform:f(f({},P),i),extra:{attributes:c,styles:d,classes:["".concat(m.cssPrefix,"-layers-text")].concat(M(o))}})})}}},provides:function(e){e.generateLayersText=function(t,r){var n=r.transform,i=r.extra,s=null,o=null;if(_e){var l=parseInt(getComputedStyle(t).fontSize,10),c=t.getBoundingClientRect();s=c.width/l,o=c.height/l}return Promise.resolve([t,ve({content:t.innerHTML,width:s,height:o,transform:n,extra:i,watchable:!0})])}}},Et=new RegExp('"',"ug"),Se=[1105920,1112319],we=f(f(f(f({},{FontAwesome:{normal:"fas",400:"fas"}}),xr),Ln),Pr),$a=Object.keys(we).reduce(function(a,e){return a[e.toLowerCase()]=we[e],a},{}),Ri=Object.keys($a).reduce(function(a,e){var t=$a[e];return a[e]=t[900]||M(Object.entries(t))[0][1],a},{});function Ui(a){var e=a.replace(Et,"");return ht(M(e)[0]||"")}function Wi(a){var e=a.getPropertyValue("font-feature-settings").includes("ss01"),t=a.getPropertyValue("content"),r=t.replace(Et,""),n=r.codePointAt(0),i=n>=Se[0]&&n<=Se[1],s=r.length===2?r[0]===r[1]:!1;return i||s||e}function Yi(a,e){var t=a.replace(/^['"]|['"]$/g,"").toLowerCase(),r=parseInt(e),n=isNaN(r)?"normal":r;return($a[t]||{})[n]||Ri[t]}function Ae(a,e){var t="".concat(Cn).concat(e.replace(":","-"));return new Promise(function(r,n){if(a.getAttribute(t)!==null)return r();var i=V(a.children),s=i.filter(function(ra){return ra.getAttribute(Ma)===e})[0],o=_.getComputedStyle(a,e),l=o.getPropertyValue("font-family"),c=l.match(En),u=o.getPropertyValue("font-weight"),d=o.getPropertyValue("content");if(s&&!c)return a.removeChild(s),r();if(c&&d!=="none"&&d!==""){var h=o.getPropertyValue("content"),v=Yi(l,u),y=Ui(h),b=c[0].startsWith("FontAwesome"),S=Wi(o),w=Xa(v,y),A=w;if(b){var k=Zn(y);k.iconName&&k.prefix&&(w=k.iconName,v=k.prefix)}if(w&&!S&&(!s||s.getAttribute(Wa)!==v||s.getAttribute(Ya)!==A)){a.setAttribute(t,A),s&&a.removeChild(s);var I=Ii(),g=I.extra;g.attributes[Ma]=e,_a(w,v).then(function(ra){var Dt=Ka(f(f({},I),{},{icons:{main:ra,mask:zt()},prefix:v,iconName:A,extra:g,watchable:!0})),ga=x.createElementNS("http://www.w3.org/2000/svg","svg");e==="::before"?a.insertBefore(ga,a.firstChild):a.appendChild(ga),ga.outerHTML=Dt.map(function($t){return ta($t)}).join(`
`),a.removeAttribute(t),r()}).catch(n)}else r()}else r()})}function Hi(a){return Promise.all([Ae(a,"::before"),Ae(a,"::after")])}function Bi(a){return a.parentNode!==document.head&&!~Pn.indexOf(a.tagName.toUpperCase())&&!a.getAttribute(Ma)&&(!a.parentNode||a.parentNode.tagName!=="svg")}var Gi=function(e){return!!e&&ot.some(function(t){return e.includes(t)})},Vi=function(e){if(!e)return[];var t=new Set,r=e.split(/,(?![^()]*\))/).map(function(l){return l.trim()});r=r.flatMap(function(l){return l.includes("(")?l:l.split(",").map(function(c){return c.trim()})});var n=sa(r),i;try{for(n.s();!(i=n.n()).done;){var s=i.value;if(Gi(s)){var o=ot.reduce(function(l,c){return l.replace(c,"")},s);o!==""&&o!=="*"&&t.add(o)}}}catch(l){n.e(l)}finally{n.f()}return t};function ke(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;if(T){var t;if(e)t=a;else if(m.searchPseudoElementsFullScan)t=a.querySelectorAll("*");else{var r=new Set,n=sa(document.styleSheets),i;try{for(n.s();!(i=n.n()).done;){var s=i.value;try{var o=sa(s.cssRules),l;try{for(o.s();!(l=o.n()).done;){var c=l.value,u=Vi(c.selectorText),d=sa(u),h;try{for(d.s();!(h=d.n()).done;){var v=h.value;r.add(v)}}catch(b){d.e(b)}finally{d.f()}}}catch(b){o.e(b)}finally{o.f()}}catch(b){m.searchPseudoElementsWarnings&&console.warn("Font Awesome: cannot parse stylesheet: ".concat(s.href," (").concat(b.message,`)
If it declares any Font Awesome CSS pseudo-elements, they will not be rendered as SVG icons. Add crossorigin="anonymous" to the <link>, enable searchPseudoElementsFullScan for slower but more thorough DOM parsing, or suppress this warning by setting searchPseudoElementsWarnings to false.`))}}}catch(b){n.e(b)}finally{n.f()}if(!r.size)return;var y=Array.from(r).join(", ");try{t=a.querySelectorAll(y)}catch{}}return new Promise(function(b,S){var w=V(t).filter(Bi).map(Hi),A=qa.begin("searchPseudoElements");It(),Promise.all(w).then(function(){A(),Da(),b()}).catch(function(){A(),Da(),S()})})}}var Xi={hooks:function(){return{mutationObserverCallbacks:function(t){return t.pseudoElementsCallback=ke,t}}},provides:function(e){e.pseudoElements2svg=function(t){var r=t.node,n=r===void 0?x:r;m.searchPseudoElements&&ke(n)}}},ze=!1,Ki={mixout:function(){return{dom:{unwatch:function(){It(),ze=!0}}}},hooks:function(){return{bootstrap:function(){be(Fa("mutationObserverCallbacks",{}))},noAuto:function(){Li()},watch:function(t){var r=t.observeMutationsRoot;ze?Da():be(Fa("mutationObserverCallbacks",{observeMutationsRoot:r}))}}}},Le=function(e){var t={size:16,x:0,y:0,flipX:!1,flipY:!1,rotate:0};return e.toLowerCase().split(" ").reduce(function(r,n){var i=n.toLowerCase().split("-"),s=i[0],o=i.slice(1).join("-");if(s&&o==="h")return r.flipX=!0,r;if(s&&o==="v")return r.flipY=!0,r;if(o=parseFloat(o),isNaN(o))return r;switch(s){case"grow":r.size=r.size+o;break;case"shrink":r.size=r.size-o;break;case"left":r.x=r.x-o;break;case"right":r.x=r.x+o;break;case"up":r.y=r.y-o;break;case"down":r.y=r.y+o;break;case"rotate":r.rotate=r.rotate+o;break}return r},t)},qi={mixout:function(){return{parse:{transform:function(t){return Le(t)}}}},hooks:function(){return{parseNodeAttributes:function(t,r){var n=r.getAttribute("data-fa-transform");return n&&(t.transform=Le(n)),t}}},provides:function(e){e.generateAbstractTransformGrouping=function(t){var r=t.main,n=t.transform,i=t.containerWidth,s=t.iconWidth,o={transform:"translate(".concat(i/2," 256)")},l="translate(".concat(n.x*32,", ").concat(n.y*32,") "),c="scale(".concat(n.size/16*(n.flipX?-1:1),", ").concat(n.size/16*(n.flipY?-1:1),") "),u="rotate(".concat(n.rotate," 0 0)"),d={transform:"".concat(l," ").concat(c," ").concat(u)},h={transform:"translate(".concat(s/2*-1," -256)")},v={outer:o,inner:d,path:h};return{tag:"g",attributes:f({},v.outer),children:[{tag:"g",attributes:f({},v.inner),children:[{tag:r.icon.tag,children:r.icon.children,attributes:f(f({},r.icon.attributes),v.path)}]}]}}}},ka={x:0,y:0,width:"100%",height:"100%"};function Ce(a){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!0;return a.attributes&&(a.attributes.fill||e)&&(a.attributes.fill="black"),a}function Ji(a){return a.tag==="g"?a.children:[a]}var Qi={hooks:function(){return{parseNodeAttributes:function(t,r){var n=r.getAttribute("data-fa-mask"),i=n?pa(n.split(" ").map(function(s){return s.trim()})):zt();return i.prefix||(i.prefix=j()),t.mask=i,t.maskId=r.getAttribute("data-fa-mask-id"),t}}},provides:function(e){e.generateAbstractMask=function(t){var r=t.children,n=t.attributes,i=t.main,s=t.mask,o=t.maskId,l=t.transform,c=i.width,u=i.icon,d=s.width,h=s.icon,v=Yn({transform:l,containerWidth:d,iconWidth:c}),y={tag:"rect",attributes:f(f({},ka),{},{fill:"white"})},b=u.children?{children:u.children.map(Ce)}:{},S={tag:"g",attributes:f({},v.inner),children:[Ce(f({tag:u.tag,attributes:f(f({},u.attributes),v.path)},b))]},w={tag:"g",attributes:f({},v.outer),children:[S]},A="mask-".concat(o||oe()),k="clip-".concat(o||oe()),I={tag:"mask",attributes:f(f({},ka),{},{id:A,maskUnits:"userSpaceOnUse",maskContentUnits:"userSpaceOnUse"}),children:[y,w]},g={tag:"defs",children:[{tag:"clipPath",attributes:{id:k},children:Ji(h)},I]};return r.push(g,{tag:"rect",attributes:f({fill:"currentColor","clip-path":"url(#".concat(k,")"),mask:"url(#".concat(A,")")},ka)}),{children:r,attributes:n}}}},Zi={provides:function(e){var t=!1;_.matchMedia&&(t=_.matchMedia("(prefers-reduced-motion: reduce)").matches),e.missingIconAbstract=function(){var r=[],n={fill:"currentColor"},i={attributeType:"XML",repeatCount:"indefinite",dur:"2s"};r.push({tag:"path",attributes:f(f({},n),{},{d:"M156.5,447.7l-12.6,29.5c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7C127.6,430.5,141.5,440,156.5,447.7z M40.6,272H8.5 c1.4,21.2,5.4,41.7,11.7,61.1L50,321.2C45.1,305.5,41.8,289,40.6,272z M40.6,240c1.4-18.8,5.2-37,11.1-54.1l-29.5-12.6 C14.7,194.3,10,216.7,8.5,240H40.6z M64.3,156.5c7.8-14.9,17.2-28.8,28.1-41.5L69.7,92.3c-13.7,15.6-25.5,32.8-34.9,51.5 L64.3,156.5z M397,419.6c-13.9,12-29.4,22.3-46.1,30.4l11.9,29.8c20.7-9.9,39.8-22.6,56.9-37.6L397,419.6z M115,92.4 c13.9-12,29.4-22.3,46.1-30.4l-11.9-29.8c-20.7,9.9-39.8,22.6-56.8,37.6L115,92.4z M447.7,355.5c-7.8,14.9-17.2,28.8-28.1,41.5 l22.7,22.7c13.7-15.6,25.5-32.9,34.9-51.5L447.7,355.5z M471.4,272c-1.4,18.8-5.2,37-11.1,54.1l29.5,12.6 c7.5-21.1,12.2-43.5,13.6-66.8H471.4z M321.2,462c-15.7,5-32.2,8.2-49.2,9.4v32.1c21.2-1.4,41.7-5.4,61.1-11.7L321.2,462z M240,471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6,29.5c21.1,7.5,43.5,12.2,66.8,13.6V471.4z M462,190.8c5,15.7,8.2,32.2,9.4,49.2h32.1 c-1.4-21.2-5.4-41.7-11.7-61.1L462,190.8z M92.4,397c-12-13.9-22.3-29.4-30.4-46.1l-29.8,11.9c9.9,20.7,22.6,39.8,37.6,56.9 L92.4,397z M272,40.6c18.8,1.4,36.9,5.2,54.1,11.1l12.6-29.5C317.7,14.7,295.3,10,272,8.5V40.6z M190.8,50 c15.7-5,32.2-8.2,49.2-9.4V8.5c-21.2,1.4-41.7,5.4-61.1,11.7L190.8,50z M442.3,92.3L419.6,115c12,13.9,22.3,29.4,30.5,46.1 l29.8-11.9C470,128.5,457.3,109.4,442.3,92.3z M397,92.4l22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6,29.5 C370.4,72.1,384.4,81.5,397,92.4z"})});var s=f(f({},i),{},{attributeName:"opacity"}),o={tag:"circle",attributes:f(f({},n),{},{cx:"256",cy:"364",r:"28"}),children:[]};return t||o.children.push({tag:"animate",attributes:f(f({},i),{},{attributeName:"r",values:"28;14;28;28;14;28;"})},{tag:"animate",attributes:f(f({},s),{},{values:"1;0;1;1;0;1;"})}),r.push(o),r.push({tag:"path",attributes:f(f({},n),{},{opacity:"1",d:"M263.7,312h-16c-6.6,0-12-5.4-12-12c0-71,77.4-63.9,77.4-107.8c0-20-17.8-40.2-57.4-40.2c-29.1,0-44.3,9.6-59.2,28.7 c-3.9,5-11.1,6-16.2,2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2c21.2-27.2,46.4-44.7,91.2-44.7c52.3,0,97.4,29.8,97.4,80.2 c0,67.6-77.4,63.5-77.4,107.8C275.7,306.6,270.3,312,263.7,312z"}),children:t?[]:[{tag:"animate",attributes:f(f({},s),{},{values:"1;0;0;0;0;1;"})}]}),t||r.push({tag:"path",attributes:f(f({},n),{},{opacity:"0",d:"M232.5,134.5l7,168c0.3,6.4,5.6,11.5,12,11.5h9c6.4,0,11.7-5.1,12-11.5l7-168c0.3-6.8-5.2-12.5-12-12.5h-23 C237.7,122,232.2,127.7,232.5,134.5z"}),children:[{tag:"animate",attributes:f(f({},s),{},{values:"0;0;1;1;0;0;"})}]}),{tag:"g",attributes:{class:"missing"},children:r}}}},a1={hooks:function(){return{parseNodeAttributes:function(t,r){var n=r.getAttribute("data-fa-symbol"),i=n===null?!1:n===""?!0:n;return t.symbol=i,t}}}},e1=[Gn,_i,ji,Di,$i,Xi,Ki,qi,Qi,Zi,a1];li(e1,{mixoutsTo:L});L.noAuto;var Z=L.config;L.library;L.dom;var Ft=L.parse;L.findIconDefinition;L.toHtml;var t1=L.icon;L.layer;L.text;L.counter;function r1(a){return a=a-0,a===a}function Ot(a){return r1(a)?a:(a=a.replace(/[_-]+(.)?/g,(e,t)=>t?t.toUpperCase():""),a.charAt(0).toLowerCase()+a.slice(1))}function n1(a){return a.charAt(0).toUpperCase()+a.slice(1)}var Y=new Map,i1=1e3;function s1(a){if(Y.has(a))return Y.get(a);const e={};let t=0;const r=a.length;for(;t<r;){const n=a.indexOf(";",t),i=n===-1?r:n,s=a.slice(t,i).trim();if(s){const o=s.indexOf(":");if(o>0){const l=s.slice(0,o).trim(),c=s.slice(o+1).trim();if(l&&c){const u=Ot(l);e[u.startsWith("webkit")?n1(u):u]=c}}}t=i+1}if(Y.size===i1){const n=Y.keys().next().value;n&&Y.delete(n)}return Y.set(a,e),e}function Tt(a,e,t={}){if(typeof e=="string")return e;const r=(e.children||[]).map(u=>Tt(a,u)),n=e.attributes||{},i={};for(const[u,d]of Object.entries(n))switch(!0){case u==="class":{i.className=d;break}case u==="style":{i.style=s1(String(d));break}case u.startsWith("aria-"):case u.startsWith("data-"):{i[u.toLowerCase()]=d;break}default:i[Ot(u)]=d}const{style:s,role:o,"aria-label":l,...c}=t;return s&&(i.style=i.style?{...i.style,...s}:s),o&&(i.role=o),l&&(i["aria-label"]=l,i["aria-hidden"]="false"),a(e.tag,{...c,...i},...r)}var o1=Tt.bind(null,Ne.createElement),Me=(a,e)=>{const t=Rt.useId();return a||(e?t:void 0)},l1=class{constructor(a="react-fontawesome"){this.enabled=!1;let e=!1;try{e=typeof process<"u"&&!1}catch{}this.scope=a,this.enabled=e}log(...a){this.enabled&&console.log(`[${this.scope}]`,...a)}warn(...a){this.enabled&&console.warn(`[${this.scope}]`,...a)}error(...a){this.enabled&&console.error(`[${this.scope}]`,...a)}},f1="searchPseudoElementsFullScan"in Z?"7.0.0":"6.0.0",c1=Number.parseInt(f1)>=7,J="fa",N={beat:"fa-beat",fade:"fa-fade",beatFade:"fa-beat-fade",bounce:"fa-bounce",shake:"fa-shake",spin:"fa-spin",spinPulse:"fa-spin-pulse",spinReverse:"fa-spin-reverse",pulse:"fa-pulse"},u1={left:"fa-pull-left",right:"fa-pull-right"},d1={90:"fa-rotate-90",180:"fa-rotate-180",270:"fa-rotate-270"},m1={"2xs":"fa-2xs",xs:"fa-xs",sm:"fa-sm",lg:"fa-lg",xl:"fa-xl","2xl":"fa-2xl","1x":"fa-1x","2x":"fa-2x","3x":"fa-3x","4x":"fa-4x","5x":"fa-5x","6x":"fa-6x","7x":"fa-7x","8x":"fa-8x","9x":"fa-9x","10x":"fa-10x"},E={border:"fa-border",fixedWidth:"fa-fw",flip:"fa-flip",flipHorizontal:"fa-flip-horizontal",flipVertical:"fa-flip-vertical",inverse:"fa-inverse",rotateBy:"fa-rotate-by",swapOpacity:"fa-swap-opacity",widthAuto:"fa-width-auto"};function v1(a){const e=Z.cssPrefix||Z.familyPrefix||J;return e===J?a:a.replace(new RegExp(String.raw`(?<=^|\s)${J}-`,"g"),`${e}-`)}function p1(a){const{beat:e,fade:t,beatFade:r,bounce:n,shake:i,spin:s,spinPulse:o,spinReverse:l,pulse:c,fixedWidth:u,inverse:d,border:h,flip:v,size:y,rotation:b,pull:S,swapOpacity:w,rotateBy:A,widthAuto:k,className:I}=a,g=[];return I&&g.push(...I.split(" ")),e&&g.push(N.beat),t&&g.push(N.fade),r&&g.push(N.beatFade),n&&g.push(N.bounce),i&&g.push(N.shake),s&&g.push(N.spin),l&&g.push(N.spinReverse),o&&g.push(N.spinPulse),c&&g.push(N.pulse),u&&g.push(E.fixedWidth),d&&g.push(E.inverse),h&&g.push(E.border),v===!0&&g.push(E.flip),(v==="horizontal"||v==="both")&&g.push(E.flipHorizontal),(v==="vertical"||v==="both")&&g.push(E.flipVertical),y!=null&&g.push(m1[y]),b!=null&&b!==0&&g.push(d1[b]),S!=null&&g.push(u1[S]),w&&g.push(E.swapOpacity),c1?(A&&g.push(E.rotateBy),k&&g.push(E.widthAuto),(Z.cssPrefix||Z.familyPrefix||J)===J?g:g.map(v1)):g}var h1=a=>typeof a=="object"&&"icon"in a&&!!a.icon;function Pe(a){if(a)return h1(a)?a:Ft.icon(a)}function g1(a){return Object.keys(a)}var Ie=new l1("FontAwesomeIcon"),_t={border:!1,className:"",mask:void 0,maskId:void 0,fixedWidth:!1,inverse:!1,flip:!1,icon:void 0,listItem:!1,pull:void 0,pulse:!1,rotation:void 0,rotateBy:!1,size:void 0,spin:!1,spinPulse:!1,spinReverse:!1,beat:!1,fade:!1,beatFade:!1,bounce:!1,shake:!1,symbol:!1,title:"",titleId:void 0,transform:void 0,swapOpacity:!1,widthAuto:!1},b1=new Set(Object.keys(_t)),y1=Ne.forwardRef((a,e)=>{const t={..._t,...a},{icon:r,mask:n,symbol:i,title:s,titleId:o,maskId:l,transform:c}=t,u=Me(l,!!n),d=Me(o,!!s),h=Pe(r);if(!h)return Ie.error("Icon lookup is undefined",r),null;const v=p1(t),y=typeof c=="string"?Ft.transform(c):c,b=Pe(n),S=t1(h,{...v.length>0&&{classes:v},...y&&{transform:y},...b&&{mask:b},symbol:i,title:s,titleId:d,maskId:u});if(!S)return Ie.error("Could not find icon",h),null;const{abstract:w}=S,A={ref:e};for(const k of g1(t))b1.has(k)||(A[k]=t[k]);return o1(w[0],A)});y1.displayName="FontAwesomeIcon";var G1={prefix:"fas",iconName:"dollar-sign",icon:[320,512,[128178,61781,"dollar","usd"],"24","M136 24c0-13.3 10.7-24 24-24s24 10.7 24 24l0 40 56 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-114.9 0c-24.9 0-45.1 20.2-45.1 45.1 0 22.5 16.5 41.5 38.7 44.7l91.6 13.1c53.8 7.7 93.7 53.7 93.7 108 0 60.3-48.9 109.1-109.1 109.1l-10.9 0 0 40c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-40-72 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l130.9 0c24.9 0 45.1-20.2 45.1-45.1 0-22.5-16.5-41.5-38.7-44.7l-91.6-13.1C55.9 273.5 16 227.4 16 173.1 16 112.9 64.9 64 125.1 64l10.9 0 0-40z"]},V1={prefix:"fas",iconName:"minus",icon:[448,512,[8211,8722,10134,"subtract"],"f068","M0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"]},x1={prefix:"fas",iconName:"scale-balanced",icon:[640,512,[9878,"balance-scale"],"f24e","M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3l0 294.7 160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-384 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288L584.4 320 512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1-10.8 44.8-63.1 78.9-126 78.9zM126.8 195.8L54.4 320 199.3 320 126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1-10.8 44.8-63.1 78.9-126 78.9S11.7 382 .9 337.1z"]},X1=x1,K1={prefix:"fas",iconName:"scroll",icon:[576,512,[128220],"f70e","M0 112C0 70.5 31.6 36.4 72 32.4l0-.4 280 0c53 0 96 43 96 96l0 176-176 0c-39.8 0-72 32.2-72 72l0 60c0 24.3-19.7 44-44 44s-44-19.7-44-44l0-228-64 0c-26.5 0-48-21.5-48-48l0-48zM236.8 480c7.1-13.1 11.2-28.1 11.2-44l0-60c0-13.3 10.7-24 24-24l248 0c13.3 0 24 10.7 24 24l0 24c0 44.2-35.8 80-80 80l-227.2 0zM80 80c-17.7 0-32 14.3-32 32l0 48 64 0 0-48c0-17.7-14.3-32-32-32z"]},q1={prefix:"fas",iconName:"filter",icon:[512,512,[],"f0b0","M32 64C19.1 64 7.4 71.8 2.4 83.8S.2 109.5 9.4 118.6L192 301.3 192 416c0 8.5 3.4 16.6 9.4 22.6l64 64c9.2 9.2 22.9 11.9 34.9 6.9S320 492.9 320 480l0-178.7 182.6-182.6c9.2-9.2 11.9-22.9 6.9-34.9S492.9 64 480 64L32 64z"]},J1={prefix:"fas",iconName:"envelope",icon:[512,512,[128386,9993,61443],"f0e0","M48 64c-26.5 0-48 21.5-48 48 0 15.1 7.1 29.3 19.2 38.4l208 156c17.1 12.8 40.5 12.8 57.6 0l208-156c12.1-9.1 19.2-23.3 19.2-38.4 0-26.5-21.5-48-48-48L48 64zM0 196L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-188-198.4 148.8c-34.1 25.6-81.1 25.6-115.2 0L0 196z"]},Q1={prefix:"fas",iconName:"user-check",icon:[640,512,[],"f4fc","M286 304c98.5 0 178.3 79.8 178.3 178.3 0 16.4-13.3 29.7-29.7 29.7L78 512c-16.4 0-29.7-13.3-29.7-29.7 0-98.5 79.8-178.3 178.3-178.3l59.4 0zM585.7 105.9c7.8-10.7 22.8-13.1 33.5-5.3s13.1 22.8 5.3 33.5L522.1 274.9c-4.2 5.7-10.7 9.4-17.7 9.8s-14-2.2-18.9-7.3l-46.4-48c-9.2-9.5-9-24.7 .6-33.9 9.5-9.2 24.7-8.9 33.9 .6l26.5 27.4 85.6-117.7zM256.3 248a120 120 0 1 1 0-240 120 120 0 1 1 0 240z"]},S1={prefix:"fas",iconName:"up-right-from-square",icon:[512,512,["external-link-alt"],"f35d","M290.4 19.8C295.4 7.8 307.1 0 320 0L480 0c17.7 0 32 14.3 32 32l0 160c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9L400 157.3 246.6 310.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L354.7 112 297.4 54.6c-9.2-9.2-11.9-22.9-6.9-34.9zM0 176c0-44.2 35.8-80 80-80l80 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-80 0c-8.8 0-16 7.2-16 16l0 256c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-80c0-17.7 14.3-32 32-32s32 14.3 32 32l0 80c0 44.2-35.8 80-80 80L80 512c-44.2 0-80-35.8-80-80L0 176z"]},Z1=S1,w1={prefix:"fas",iconName:"magnifying-glass",icon:[512,512,[128269,"search"],"f002","M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"]},as=w1,es={prefix:"fas",iconName:"code-branch",icon:[448,512,[],"f126","M80 104a24 24 0 1 0 0-48 24 24 0 1 0 0 48zm80-24c0 32.8-19.7 61-48 73.3l0 70.7 176 0c26.5 0 48-21.5 48-48l0-22.7c-28.3-12.3-48-40.5-48-73.3 0-44.2 35.8-80 80-80s80 35.8 80 80c0 32.8-19.7 61-48 73.3l0 22.7c0 61.9-50.1 112-112 112l-176 0 0 70.7c28.3 12.3 48 40.5 48 73.3 0 44.2-35.8 80-80 80S0 476.2 0 432c0-32.8 19.7-61 48-73.3l0-205.3C19.7 141 0 112.8 0 80 0 35.8 35.8 0 80 0s80 35.8 80 80zm232 0a24 24 0 1 0 -48 0 24 24 0 1 0 48 0zM80 456a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"]},A1={prefix:"fas",iconName:"floppy-disk",icon:[448,512,[128190,128426,"save"],"f0c7","M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-242.7c0-17-6.7-33.3-18.7-45.3L352 50.7C340 38.7 323.7 32 306.7 32L64 32zm32 96c0-17.7 14.3-32 32-32l160 0c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32l-160 0c-17.7 0-32-14.3-32-32l0-64zM224 288a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"]},ts=A1,rs={prefix:"fas",iconName:"key",icon:[512,512,[128273],"f084","M336 352c97.2 0 176-78.8 176-176S433.2 0 336 0 160 78.8 160 176c0 18.7 2.9 36.8 8.3 53.7L7 391c-4.5 4.5-7 10.6-7 17l0 80c0 13.3 10.7 24 24 24l80 0c13.3 0 24-10.7 24-24l0-40 40 0c13.3 0 24-10.7 24-24l0-40 40 0c6.4 0 12.5-2.5 17-7l33.3-33.3c16.9 5.4 35 8.3 53.7 8.3zM376 96a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"]},ns={prefix:"fas",iconName:"eye",icon:[576,512,[128065],"f06e","M288 32c-80.8 0-145.5 36.8-192.6 80.6-46.8 43.5-78.1 95.4-93 131.1-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64-11.5 0-22.3-3-31.7-8.4-1 10.9-.1 22.1 2.9 33.2 13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-12.2-45.7-55.5-74.8-101.1-70.8 5.3 9.3 8.4 20.1 8.4 31.7z"]},is={prefix:"fas",iconName:"trash",icon:[448,512,[],"f1f8","M136.7 5.9L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-8.7-26.1C306.9-7.2 294.7-16 280.9-16L167.1-16c-13.8 0-26 8.8-30.4 21.9zM416 144L32 144 53.1 467.1C54.7 492.4 75.7 512 101 512L347 512c25.3 0 46.3-19.6 47.9-44.9L416 144z"]},ss={prefix:"fas",iconName:"chevron-up",icon:[448,512,[],"f077","M201.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L224 173.3 54.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"]},os={prefix:"fas",iconName:"circle-notch",icon:[512,512,[],"f1ce","M222.7 32.1c5 16.9-4.6 34.8-21.5 39.8-79.3 23.6-137.1 97.1-137.1 184.1 0 106 86 192 192 192s192-86 192-192c0-86.9-57.8-160.4-137.1-184.1-16.9-5-26.6-22.9-21.5-39.8s22.9-26.6 39.8-21.5C434.9 42.1 512 140 512 256 512 397.4 397.4 512 256 512S0 397.4 0 256c0-116 77.1-213.9 182.9-245.4 16.9-5 34.8 4.6 39.8 21.5z"]},k1={prefix:"fas",iconName:"ellipsis-vertical",icon:[128,512,["ellipsis-v"],"f142","M64 144a56 56 0 1 1 0-112 56 56 0 1 1 0 112zm0 224c30.9 0 56 25.1 56 56s-25.1 56-56 56-56-25.1-56-56 25.1-56 56-56zm56-112c0 30.9-25.1 56-56 56s-56-25.1-56-56 25.1-56 56-56 56 25.1 56 56z"]},ls=k1,z1={prefix:"fas",iconName:"right-to-bracket",icon:[512,512,["sign-in-alt"],"f2f6","M345 273c9.4-9.4 9.4-24.6 0-33.9L201 95c-6.9-6.9-17.2-8.9-26.2-5.2S160 102.3 160 112l0 80-112 0c-26.5 0-48 21.5-48 48l0 32c0 26.5 21.5 48 48 48l112 0 0 80c0 9.7 5.8 18.5 14.8 22.2s19.3 1.7 26.2-5.2L345 273zm7 143c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0c53 0 96-43 96-96l0-256c0-53-43-96-96-96l-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0c17.7 0 32 14.3 32 32l0 256c0 17.7-14.3 32-32 32l-64 0z"]},fs=z1,L1={prefix:"fas",iconName:"file-arrow-up",icon:[384,512,["file-upload"],"f574","M0 64C0 28.7 28.7 0 64 0L213.5 0c17 0 33.3 6.7 45.3 18.7L365.3 125.3c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64zm208-5.5l0 93.5c0 13.3 10.7 24 24 24L325.5 176 208 58.5zM209 263c-9.4-9.4-24.6-9.4-33.9 0l-64 64c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l23-23 0 86.1c0 13.3 10.7 24 24 24s24-10.7 24-24l0-86.1 23 23c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-64-64z"]},cs=L1,C1={prefix:"fas",iconName:"pen-to-square",icon:[512,512,["edit"],"f044","M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L368 46.1 465.9 144 490.3 119.6c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L432 177.9 334.1 80 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z"]},us=C1,ds={prefix:"fas",iconName:"clock",icon:[512,512,[128339,"clock-four"],"f017","M256 0a256 256 0 1 1 0 512 256 256 0 1 1 0-512zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"]},ms={prefix:"fas",iconName:"paper-plane",icon:[576,512,[61913],"f1d8","M536.4-26.3c9.8-3.5 20.6-1 28 6.3s9.8 18.2 6.3 28l-178 496.9c-5 13.9-18.1 23.1-32.8 23.1-14.2 0-27-8.6-32.3-21.7l-64.2-158c-4.5-11-2.5-23.6 5.2-32.6l94.5-112.4c5.1-6.1 4.7-15-.9-20.6s-14.6-6-20.6-.9L229.2 276.1c-9.1 7.6-21.6 9.6-32.6 5.2L38.1 216.8c-13.1-5.3-21.7-18.1-21.7-32.3 0-14.7 9.2-27.8 23.1-32.8l496.9-178z"]},vs={prefix:"fas",iconName:"folder-open",icon:[576,512,[128194,128449,61717],"f07c","M56 225.6L32.4 296.2 32.4 96c0-35.3 28.7-64 64-64l138.7 0c13.8 0 27.3 4.5 38.4 12.8l38.4 28.8c5.5 4.2 12.3 6.4 19.2 6.4l117.3 0c35.3 0 64 28.7 64 64l0 16-365.4 0c-41.3 0-78 26.4-91.1 65.6zM477.8 448L99 448c-32.8 0-55.9-32.1-45.5-63.2l48-144C108 221.2 126.4 208 147 208l378.8 0c32.8 0 55.9 32.1 45.5 63.2l-48 144c-6.5 19.6-24.9 32.8-45.5 32.8z"]},ps={prefix:"fas",iconName:"chevron-right",icon:[320,512,[9002],"f054","M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"]},hs={prefix:"fas",iconName:"print",icon:[512,512,[128424,128438,9113],"f02f","M64 64C64 28.7 92.7 0 128 0L341.5 0c17 0 33.3 6.7 45.3 18.7l42.5 42.5c12 12 18.7 28.3 18.7 45.3l0 37.5-384 0 0-80zM0 256c0-35.3 28.7-64 64-64l384 0c35.3 0 64 28.7 64 64l0 96c0 17.7-14.3 32-32 32l-32 0 0 64c0 35.3-28.7 64-64 64l-256 0c-35.3 0-64-28.7-64-64l0-64-32 0c-17.7 0-32-14.3-32-32l0-96zM128 416l0 32 256 0 0-96-256 0 0 64zM456 272a24 24 0 1 0 -48 0 24 24 0 1 0 48 0z"]},gs={prefix:"fas",iconName:"users",icon:[640,512,[],"f0c0","M320 16a104 104 0 1 1 0 208 104 104 0 1 1 0-208zM96 88a72 72 0 1 1 0 144 72 72 0 1 1 0-144zM0 416c0-70.7 57.3-128 128-128 12.8 0 25.2 1.9 36.9 5.4-32.9 36.8-52.9 85.4-52.9 138.6l0 16c0 11.4 2.4 22.2 6.7 32L32 480c-17.7 0-32-14.3-32-32l0-32zm521.3 64c4.3-9.8 6.7-20.6 6.7-32l0-16c0-53.2-20-101.8-52.9-138.6 11.7-3.5 24.1-5.4 36.9-5.4 70.7 0 128 57.3 128 128l0 32c0 17.7-14.3 32-32 32l-86.7 0zM472 160a72 72 0 1 1 144 0 72 72 0 1 1 -144 0zM160 432c0-88.4 71.6-160 160-160s160 71.6 160 160l0 16c0 17.7-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32l0-16z"]},bs={prefix:"fas",iconName:"share",icon:[512,512,["mail-forward"],"f064","M307.8 18.4c-12 5-19.8 16.6-19.8 29.6l0 80-112 0c-97.2 0-176 78.8-176 176 0 113.3 81.5 163.9 100.2 174.1 2.5 1.4 5.3 1.9 8.1 1.9 10.9 0 19.7-8.9 19.7-19.7 0-7.5-4.3-14.4-9.8-19.5-9.4-8.8-22.2-26.4-22.2-56.7 0-53 43-96 96-96l96 0 0 80c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l160-160c12.5-12.5 12.5-32.8 0-45.3l-160-160c-9.2-9.2-22.9-11.9-34.9-6.9z"]},ys={prefix:"fas",iconName:"comment",icon:[512,512,[128489,61669],"f075","M512 240c0 132.5-114.6 240-256 240-37.1 0-72.3-7.4-104.1-20.7L33.5 510.1c-9.4 4-20.2 1.7-27.1-5.8S-2 485.8 2.8 476.8l48.8-92.2C19.2 344.3 0 294.3 0 240 0 107.5 114.6 0 256 0S512 107.5 512 240z"]},xs={prefix:"fas",iconName:"clipboard-list",icon:[384,512,[],"f46d","M311.4 32l8.6 0c35.3 0 64 28.7 64 64l0 352c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l8.6 0C83.6 12.9 104.3 0 128 0L256 0c23.7 0 44.4 12.9 55.4 32zM248 112c13.3 0 24-10.7 24-24s-10.7-24-24-24L136 64c-13.3 0-24 10.7-24 24s10.7 24 24 24l112 0zM128 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm32 0c0 13.3 10.7 24 24 24l112 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-112 0c-13.3 0-24 10.7-24 24zm0 128c0 13.3 10.7 24 24 24l112 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-112 0c-13.3 0-24 10.7-24 24zM96 416a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"]},M1={prefix:"fas",iconName:"pencil",icon:[512,512,[9999,61504,"pencil-alt"],"f303","M36.4 353.2c4.1-14.6 11.8-27.9 22.6-38.7l181.2-181.2 33.9-33.9c16.6 16.6 51.3 51.3 104 104l33.9 33.9-33.9 33.9-181.2 181.2c-10.7 10.7-24.1 18.5-38.7 22.6L30.4 510.6c-8.3 2.3-17.3 0-23.4-6.2S-1.4 489.3 .9 481L36.4 353.2zm55.6-3.7c-4.4 4.7-7.6 10.4-9.3 16.6l-24.1 86.9 86.9-24.1c6.4-1.8 12.2-5.1 17-9.7L91.9 349.5zm354-146.1c-16.6-16.6-51.3-51.3-104-104L308 65.5C334.5 39 349.4 24.1 352.9 20.6 366.4 7 384.8-.6 404-.6S441.6 7 455.1 20.6l35.7 35.7C504.4 69.9 512 88.3 512 107.4s-7.6 37.6-21.2 51.1c-3.5 3.5-18.4 18.4-44.9 44.9z"]},Ss=M1,ws={prefix:"fas",iconName:"user-plus",icon:[640,512,[],"f234","M136 128a120 120 0 1 1 240 0 120 120 0 1 1 -240 0zM48 482.3C48 383.8 127.8 304 226.3 304l59.4 0c98.5 0 178.3 79.8 178.3 178.3 0 16.4-13.3 29.7-29.7 29.7L77.7 512C61.3 512 48 498.7 48 482.3zM544 96c13.3 0 24 10.7 24 24l0 48 48 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-48 0 0 48c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-48-48 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0 0-48c0-13.3 10.7-24 24-24z"]},P1={prefix:"fas",iconName:"circle-plus",icon:[512,512,["plus-circle"],"f055","M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM232 344l0-64-64 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l64 0 0-64c0-13.3 10.7-24 24-24s24 10.7 24 24l0 64 64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0 0 64c0 13.3-10.7 24-24 24s-24-10.7-24-24z"]},As=P1,ks={prefix:"fas",iconName:"folder",icon:[512,512,[128193,128447,61716,"folder-blank"],"f07b","M64 448l384 0c35.3 0 64-28.7 64-64l0-240c0-35.3-28.7-64-64-64L298.7 80c-6.9 0-13.7-2.2-19.2-6.4L241.1 44.8C230 36.5 216.5 32 202.7 32L64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64z"]},I1={prefix:"fas",iconName:"circle-exclamation",icon:[512,512,["exclamation-circle"],"f06a","M256 512a256 256 0 1 1 0-512 256 256 0 1 1 0 512zm0-192a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.6 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z"]},zs=I1,N1={prefix:"fas",iconName:"gear",icon:[512,512,[9881,"cog"],"f013","M195.1 9.5C198.1-5.3 211.2-16 226.4-16l59.8 0c15.2 0 28.3 10.7 31.3 25.5L332 79.5c14.1 6 27.3 13.7 39.3 22.8l67.8-22.5c14.4-4.8 30.2 1.2 37.8 14.4l29.9 51.8c7.6 13.2 4.9 29.8-6.5 39.9L447 233.3c.9 7.4 1.3 15 1.3 22.7s-.5 15.3-1.3 22.7l53.4 47.5c11.4 10.1 14 26.8 6.5 39.9l-29.9 51.8c-7.6 13.1-23.4 19.2-37.8 14.4l-67.8-22.5c-12.1 9.1-25.3 16.7-39.3 22.8l-14.4 69.9c-3.1 14.9-16.2 25.5-31.3 25.5l-59.8 0c-15.2 0-28.3-10.7-31.3-25.5l-14.4-69.9c-14.1-6-27.2-13.7-39.3-22.8L73.5 432.3c-14.4 4.8-30.2-1.2-37.8-14.4L5.8 366.1c-7.6-13.2-4.9-29.8 6.5-39.9l53.4-47.5c-.9-7.4-1.3-15-1.3-22.7s.5-15.3 1.3-22.7L12.3 185.8c-11.4-10.1-14-26.8-6.5-39.9L35.7 94.1c7.6-13.2 23.4-19.2 37.8-14.4l67.8 22.5c12.1-9.1 25.3-16.7 39.3-22.8L195.1 9.5zM256.3 336a80 80 0 1 0 -.6-160 80 80 0 1 0 .6 160z"]},Ls=N1,E1={prefix:"fas",iconName:"circle-question",icon:[512,512,[62108,"question-circle"],"f059","M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zm0-336c-17.7 0-32 14.3-32 32 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-44.2 35.8-80 80-80s80 35.8 80 80c0 47.2-36 67.2-56 74.5l0 3.8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8.1c0-20.5 14.8-35.2 30.1-40.2 6.4-2.1 13.2-5.5 18.2-10.3 4.3-4.2 7.7-10 7.7-19.6 0-17.7-14.3-32-32-32zM224 368a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"]},Cs=E1,F1={prefix:"fas",iconName:"right-from-bracket",icon:[512,512,["sign-out-alt"],"f2f5","M505 273c9.4-9.4 9.4-24.6 0-33.9L361 95c-6.9-6.9-17.2-8.9-26.2-5.2S320 102.3 320 112l0 80-112 0c-26.5 0-48 21.5-48 48l0 32c0 26.5 21.5 48 48 48l112 0 0 80c0 9.7 5.8 18.5 14.8 22.2s19.3 1.7 26.2-5.2L505 273zM160 96c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 32C43 32 0 75 0 128L0 384c0 53 43 96 96 96l64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l64 0z"]},Ms=F1,Ps={prefix:"fas",iconName:"arrow-up",icon:[384,512,[8593],"f062","M214.6 17.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 117.3 160 488c0 17.7 14.3 32 32 32s32-14.3 32-32l0-370.7 105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z"]},Is={prefix:"fas",iconName:"paperclip",icon:[512,512,[128206],"f0c6","M224.6 12.8c56.2-56.2 147.4-56.2 203.6 0s56.2 147.4 0 203.6l-164 164c-34.4 34.4-90.1 34.4-124.5 0s-34.4-90.1 0-124.5L292.5 103.3c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L185 301.3c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l164-164c31.2-31.2 31.2-81.9 0-113.1s-81.9-31.2-113.1 0l-164 164c-53.1 53.1-53.1 139.2 0 192.3s139.2 53.1 192.3 0L428.3 284.3c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L343.4 459.6c-78.1 78.1-204.7 78.1-282.8 0s-78.1-204.7 0-282.8l164-164z"]},O1={prefix:"fas",iconName:"table-cells",icon:[448,512,["th"],"f00a","M384 96l0 64-64 0 0-64 64 0zm0 128l0 64-64 0 0-64 64 0zm0 128l0 64-64 0 0-64 64 0zM256 288l-64 0 0-64 64 0 0 64zm-64 64l64 0 0 64-64 0 0-64zm-64-64l-64 0 0-64 64 0 0 64zM64 352l64 0 0 64-64 0 0-64zm0-192l0-64 64 0 0 64-64 0zm128 0l0-64 64 0 0 64-64 0zM64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32z"]},Ns=O1,Es={prefix:"fas",iconName:"eraser",icon:[576,512,[],"f12d","M178.5 416l123 0 65.3-65.3-173.5-173.5-126.7 126.7 112 112zM224 480l-45.5 0c-17 0-33.3-6.7-45.3-18.7L17 345C6.1 334.1 0 319.4 0 304s6.1-30.1 17-41L263 17C273.9 6.1 288.6 0 304 0s30.1 6.1 41 17L527 199c10.9 10.9 17 25.6 17 41s-6.1 30.1-17 41l-135 135 120 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0z"]},Fs={prefix:"fas",iconName:"calendar",icon:[448,512,[128197,128198],"f133","M128 0C110.3 0 96 14.3 96 32l0 32-32 0C28.7 64 0 92.7 0 128l0 48 448 0 0-48c0-35.3-28.7-64-64-64l-32 0 0-32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 32-128 0 0-32c0-17.7-14.3-32-32-32zM0 224L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-192-448 0z"]},Os={prefix:"fas",iconName:"check",icon:[448,512,[10003,10004],"f00c","M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z"]},Ts={prefix:"fas",iconName:"chart-bar",icon:[512,512,["bar-chart"],"f080","M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zm96 64c0-17.7 14.3-32 32-32l192 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0c-17.7 0-32-14.3-32-32zm32 80l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-128 0c-17.7 0-32-14.3-32-32s14.3-32 32-32zm0 112l256 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z"]},_s={prefix:"fas",iconName:"spinner",icon:[512,512,[],"f110","M208 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm0 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM48 208a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm368 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM75 369.1A48 48 0 1 1 142.9 437 48 48 0 1 1 75 369.1zM75 75A48 48 0 1 1 142.9 142.9 48 48 0 1 1 75 75zM437 369.1A48 48 0 1 1 369.1 437 48 48 0 1 1 437 369.1z"]},js={prefix:"fas",iconName:"user",icon:[448,512,[128100,62144,62470,"user-alt","user-large"],"f007","M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z"]},T1={prefix:"fas",iconName:"right-left",icon:[512,512,["exchange-alt"],"f362","M502.6 150.6l-96 96c-9.2 9.2-22.9 11.9-34.9 6.9S352 236.9 352 224l0-64-320 0c-17.7 0-32-14.3-32-32S14.3 96 32 96l320 0 0-64c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l96 96c12.5 12.5 12.5 32.8 0 45.3zm-397.3 352l-96-96c-12.5-12.5-12.5-32.8 0-45.3l96-96c9.2-9.2 22.9-11.9 34.9-6.9S160 275.1 160 288l0 64 320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-320 0 0 64c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9z"]},Ds=T1,_1={prefix:"fas",iconName:"xmark",icon:[384,512,[128473,10005,10006,10060,215,"close","multiply","remove","times"],"f00d","M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"]},$s=_1,jt={prefix:"fas",iconName:"file-lines",icon:[384,512,[128441,128462,61686,"file-alt","file-text"],"f15c","M0 64C0 28.7 28.7 0 64 0L213.5 0c17 0 33.3 6.7 45.3 18.7L365.3 125.3c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64zm208-5.5l0 93.5c0 13.3 10.7 24 24 24L325.5 176 208 58.5zM120 256c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0z"]},Rs=jt,Us=jt,j1={prefix:"fas",iconName:"circle-check",icon:[512,512,[61533,"check-circle"],"f058","M256 512a256 256 0 1 1 0-512 256 256 0 1 1 0 512zM374 145.7c-10.7-7.8-25.7-5.4-33.5 5.3L221.1 315.2 169 263.1c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l72 72c5 5 11.8 7.5 18.8 7s13.4-4.1 17.5-9.8L379.3 179.2c7.8-10.7 5.4-25.7-5.3-33.5z"]},Ws=j1,Ys={prefix:"fas",iconName:"phone",icon:[512,512,[128222,128379],"f095","M160.2 25C152.3 6.1 131.7-3.9 112.1 1.4l-5.5 1.5c-64.6 17.6-119.8 80.2-103.7 156.4 37.1 175 174.8 312.7 349.8 349.8 76.3 16.2 138.8-39.1 156.4-103.7l1.5-5.5c5.4-19.7-4.7-40.3-23.5-48.1l-97.3-40.5c-16.5-6.9-35.6-2.1-47 11.8l-38.6 47.2C233.9 335.4 177.3 277 144.8 205.3L189 169.3c13.9-11.3 18.6-30.4 11.8-47L160.2 25z"]},Hs={prefix:"fas",iconName:"list",icon:[512,512,["list-squares"],"f03a","M40 48C26.7 48 16 58.7 16 72l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24L40 48zM192 64c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L192 64zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zM16 232l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24l-48 0c-13.3 0-24 10.7-24 24zM40 368c-13.3 0-24 10.7-24 24l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24l-48 0z"]},Bs={prefix:"fas",iconName:"chevron-down",icon:[448,512,[],"f078","M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"]},D1={prefix:"fas",iconName:"clock-rotate-left",icon:[576,512,["history"],"f1da","M288 64c106 0 192 86 192 192S394 448 288 448c-65.2 0-122.9-32.5-157.6-82.3-10.1-14.5-30.1-18-44.6-7.9s-18 30.1-7.9 44.6C124.1 468.6 201 512 288 512 429.4 512 544 397.4 544 256S429.4 0 288 0C202.3 0 126.5 42.1 80 106.7L80 80c0-17.7-14.3-32-32-32S16 62.3 16 80l0 112c0 17.7 14.3 32 32 32l24.6 0c.5 0 1 0 1.5 0l86 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-38.3 0C154.9 102.6 217 64 288 64zm24 88c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 104c0 6.4 2.5 12.5 7 17l72 72c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-65-65 0-94.1z"]},Gs=D1,Vs={prefix:"fas",iconName:"comment-dots",icon:[512,512,[128172,62075,"commenting"],"f4ad","M256 480c141.4 0 256-107.5 256-240S397.4 0 256 0 0 107.5 0 240c0 54.3 19.2 104.3 51.6 144.5L2.8 476.8c-4.8 9-3.3 20 3.6 27.5s17.8 9.8 27.1 5.8l118.4-50.7C183.7 472.6 218.9 480 256 480zM128 208a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm128 0a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm96 32a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"]},Xs={prefix:"fas",iconName:"inbox",icon:[512,512,[],"f01c","M91.8 32C59.9 32 32.9 55.4 28.4 86.9L.6 281.2c-.4 3-.6 6-.6 9.1L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-125.7c0-3-.2-6.1-.6-9.1L483.6 86.9C479.1 55.4 452.1 32 420.2 32L91.8 32zm0 64l328.5 0 27.4 192-59.9 0c-12.1 0-23.2 6.8-28.6 17.7l-14.3 28.6c-5.4 10.8-16.5 17.7-28.6 17.7l-120.4 0c-12.1 0-23.2-6.8-28.6-17.7l-14.3-28.6c-5.4-10.8-16.5-17.7-28.6-17.7L64.3 288 91.8 96z"]},Ks={prefix:"fas",iconName:"star",icon:[576,512,[11088,61446],"f005","M309.5-18.9c-4.1-8-12.4-13.1-21.4-13.1s-17.3 5.1-21.4 13.1L193.1 125.3 33.2 150.7c-8.9 1.4-16.3 7.7-19.1 16.3s-.5 18 5.8 24.4l114.4 114.5-25.2 159.9c-1.4 8.9 2.3 17.9 9.6 23.2s16.9 6.1 25 2L288.1 417.6 432.4 491c8 4.1 17.7 3.3 25-2s11-14.2 9.6-23.2L441.7 305.9 556.1 191.4c6.4-6.4 8.6-15.8 5.8-24.4s-10.1-14.9-19.1-16.3L383 125.3 309.5-18.9z"]},$1={prefix:"fas",iconName:"triangle-exclamation",icon:[512,512,[9888,"exclamation-triangle","warning"],"f071","M256 0c14.7 0 28.2 8.1 35.2 21l216 400c6.7 12.4 6.4 27.4-.8 39.5S486.1 480 472 480L40 480c-14.1 0-27.2-7.4-34.4-19.5s-7.5-27.1-.8-39.5l216-400c7-12.9 20.5-21 35.2-21zm0 352a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.5 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z"]},qs=$1,Js={prefix:"fas",iconName:"lock",icon:[384,512,[128274],"f023","M128 96l0 64 128 0 0-64c0-35.3-28.7-64-64-64s-64 28.7-64 64zM64 160l0-64C64 25.3 121.3-32 192-32S320 25.3 320 96l0 64c35.3 0 64 28.7 64 64l0 224c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 224c0-35.3 28.7-64 64-64z"]},Qs={prefix:"fas",iconName:"download",icon:[448,512,[],"f019","M256 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 210.7-41.4-41.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c12.5 12.5 32.8 12.5 45.3 0l96-96c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 242.7 256 32zM64 320c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-46.9 0-56.6 56.6c-31.2 31.2-81.9 31.2-113.1 0L110.9 320 64 320zm304 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"]},Zs={prefix:"fas",iconName:"language",icon:[576,512,[],"f1ab","M160 0c17.7 0 32 14.3 32 32l0 32 128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-9.6 0-8.4 23.1c-16.4 45.2-41.1 86.5-72.2 122 14.2 8.8 29 16.6 44.4 23.5l50.4 22.4 62.2-140c5.1-11.6 16.6-19 29.2-19s24.1 7.4 29.2 19l128 288c7.2 16.2-.1 35.1-16.2 42.2s-35.1-.1-42.2-16.2l-20-45-157.5 0-20 45c-7.2 16.2-26.1 23.4-42.2 16.2s-23.4-26.1-16.2-42.2l39.8-89.5-50.4-22.4c-23-10.2-45-22.4-65.8-36.4-21.3 17.2-44.6 32.2-69.5 44.7L78.3 380.6c-15.8 7.9-35 1.5-42.9-14.3s-1.5-35 14.3-42.9l34.5-17.3c16.3-8.2 31.8-17.7 46.4-28.3-13.8-12.7-26.8-26.4-38.9-40.9L81.6 224.7c-11.3-13.6-9.5-33.8 4.1-45.1s33.8-9.5 45.1 4.1l10.2 12.2c11.5 13.9 24.1 26.8 37.4 38.7 27.5-30.4 49.2-66.1 63.5-105.4l.5-1.2-210.3 0C14.3 128 0 113.7 0 96S14.3 64 32 64l96 0 0-32c0-17.7 14.3-32 32-32zM416 270.8L365.7 384 466.3 384 416 270.8z"]},R1={prefix:"fas",iconName:"shield-halved",icon:[512,512,["shield-alt"],"f3ed","M256 0c4.6 0 9.2 1 13.4 2.9L457.8 82.8c22 9.3 38.4 31 38.3 57.2-.5 99.2-41.3 280.7-213.6 363.2-16.7 8-36.1 8-52.8 0-172.4-82.5-213.1-264-213.6-363.2-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.9 1 251.4 0 256 0zm0 66.8l0 378.1c138-66.8 175.1-214.8 176-303.4l-176-74.6 0 0z"]},ao=R1,eo={prefix:"fas",iconName:"globe",icon:[512,512,[127760],"f0ac","M351.9 280l-190.9 0c2.9 64.5 17.2 123.9 37.5 167.4 11.4 24.5 23.7 41.8 35.1 52.4 11.2 10.5 18.9 12.2 22.9 12.2s11.7-1.7 22.9-12.2c11.4-10.6 23.7-28 35.1-52.4 20.3-43.5 34.6-102.9 37.5-167.4zM160.9 232l190.9 0C349 167.5 334.7 108.1 314.4 64.6 303 40.2 290.7 22.8 279.3 12.2 268.1 1.7 260.4 0 256.4 0s-11.7 1.7-22.9 12.2c-11.4 10.6-23.7 28-35.1 52.4-20.3 43.5-34.6 102.9-37.5 167.4zm-48 0C116.4 146.4 138.5 66.9 170.8 14.7 78.7 47.3 10.9 131.2 1.5 232l111.4 0zM1.5 280c9.4 100.8 77.2 184.7 169.3 217.3-32.3-52.2-54.4-131.7-57.9-217.3L1.5 280zm398.4 0c-3.5 85.6-25.6 165.1-57.9 217.3 92.1-32.7 159.9-116.5 169.3-217.3l-111.4 0zm111.4-48C501.9 131.2 434.1 47.3 342 14.7 374.3 66.9 396.4 146.4 399.9 232l111.4 0z"]},to={prefix:"fas",iconName:"upload",icon:[448,512,[],"f093","M256 109.3L256 320c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-210.7-41.4 41.4c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l96-96c12.5-12.5 32.8-12.5 45.3 0l96 96c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 109.3zM224 400c44.2 0 80-35.8 80-80l80 0c35.3 0 64 28.7 64 64l0 32c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64l0-32c0-35.3 28.7-64 64-64l80 0c0 44.2 35.8 80 80 80zm144 24a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"]},ro={prefix:"fas",iconName:"user-slash",icon:[576,512,[62714,"user-alt-slash","user-large-slash"],"f506","M41-24.9c-9.4-9.4-24.6-9.4-33.9 0S-2.3-.3 7 9.1l528 528c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9L311.5 245.7c55-10.9 96.5-59.5 96.5-117.7 0-66.3-53.7-120-120-120-58.2 0-106.8 41.5-117.7 96.5L41-24.9zM235.6 305.4C147.9 316.6 80 391.5 80 482.3 80 498.7 93.3 512 109.7 512l332.5 0-206.6-206.6z"]},no={prefix:"fas",iconName:"arrow-left",icon:[512,512,[8592],"f060","M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 288 480 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-370.7 0 105.4-105.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"]},io={prefix:"fas",iconName:"check-double",icon:[384,512,[],"f560","M249.9 66.8c10.4-14.3 7.2-34.3-7.1-44.7s-34.3-7.2-44.7 7.1l-106 145.7-37.5-37.5c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l64 64c6.6 6.6 15.8 10 25.1 9.3s17.9-5.5 23.4-13.1l128-176zm128 136c10.4-14.3 7.2-34.3-7.1-44.7s-34.3-7.2-44.7 7.1l-170 233.7-69.5-69.5c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c6.6 6.6 15.8 10 25.1 9.3s17.9-5.5 23.4-13.1l192-264z"]},so={prefix:"fas",iconName:"plus",icon:[448,512,[10133,61543,"add"],"2b","M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"]},oo={prefix:"fas",iconName:"copy",icon:[448,512,[],"f0c5","M192 0c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-200.6c0-17.4-7.1-34.1-19.7-46.2L370.6 17.8C358.7 6.4 342.8 0 326.3 0L192 0zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-16-64 0 0 16-192 0 0-256 16 0 0-64-16 0z"]},lo={prefix:"fas",iconName:"arrow-down",icon:[384,512,[8595],"f063","M169.4 502.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 402.7 224 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 370.7-105.4-105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"]},U1={prefix:"fas",iconName:"location-dot",icon:[384,512,["map-marker-alt"],"f3c5","M0 188.6C0 84.4 86 0 192 0S384 84.4 384 188.6c0 119.3-120.2 262.3-170.4 316.8-11.8 12.8-31.5 12.8-43.3 0-50.2-54.5-170.4-197.5-170.4-316.8zM192 256a64 64 0 1 0 0-128 64 64 0 1 0 0 128z"]},fo=U1,co={prefix:"fas",iconName:"bars",icon:[448,512,["navicon"],"f0c9","M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"]},W1={prefix:"fas",iconName:"arrows-rotate",icon:[512,512,[128472,"refresh","sync"],"f021","M65.9 228.5c13.3-93 93.4-164.5 190.1-164.5 53 0 101 21.5 135.8 56.2 .2 .2 .4 .4 .6 .6l7.6 7.2-47.9 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l128 0c17.7 0 32-14.3 32-32l0-128c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 53.4-11.3-10.7C390.5 28.6 326.5 0 256 0 127 0 20.3 95.4 2.6 219.5 .1 237 12.2 253.2 29.7 255.7s33.7-9.7 36.2-27.1zm443.5 64c2.5-17.5-9.7-33.7-27.1-36.2s-33.7 9.7-36.2 27.1c-13.3 93-93.4 164.5-190.1 164.5-53 0-101-21.5-135.8-56.2-.2-.2-.4-.4-.6-.6l-7.6-7.2 47.9 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 320c-8.5 0-16.7 3.4-22.7 9.5S-.1 343.7 0 352.3l1 127c.1 17.7 14.6 31.9 32.3 31.7S65.2 496.4 65 478.7l-.4-51.5 10.7 10.1c46.3 46.1 110.2 74.7 180.7 74.7 129 0 235.7-95.4 253.4-219.5z"]},uo=W1,Y1={prefix:"fas",iconName:"table-cells-large",icon:[448,512,["th-large"],"f009","M384 96l-128 0 0 128 128 0 0-128zm64 128l0 192c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 128zM64 288l0 128 128 0 0-128-128 0zm128-64l0-128-128 0 0 128 128 0zm64 64l0 128 128 0 0-128-128 0z"]},mo=Y1,H1={prefix:"fas",iconName:"circle-info",icon:[512,512,["info-circle"],"f05a","M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM224 160a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm-8 64l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"]},vo=H1,po={prefix:"fas",iconName:"shield",icon:[512,512,[128737,"shield-blank"],"f132","M256 0c4.6 0 9.2 1 13.4 2.9L457.8 82.8c22 9.3 38.4 31 38.3 57.2-.5 99.2-41.3 280.7-213.6 363.2-16.7 8-36.1 8-52.8 0-172.4-82.5-213.1-264-213.6-363.2-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.9 1 251.4 0 256 0z"]};export{js as $,Vs as A,ys as B,Gs as C,so as D,es as E,y1 as F,Ys as G,bs as H,Ts as I,mo as J,Ms as K,Ls as L,lo as M,Ps as N,Xs as O,ws as P,ns as Q,ls as R,ss as S,ps as T,ts as U,ms as V,Q1 as W,ao as X,J1 as Y,vs as Z,to as _,V1 as a,eo as a0,os as a1,fs as a2,Rs as a3,hs as a4,Qs as a5,oo as a6,Is as a7,fo as a8,Fs as a9,Ws as aa,vo as ab,qs as ac,zs as ad,gs as ae,ro as af,G1 as ag,Js as ah,co as ai,po as aj,no as ak,X1 as al,rs as am,Us as an,$s as b,Bs as c,as as d,ds as e,Os as f,Cs as g,Ks as h,Ds as i,K1 as j,q1 as k,Es as l,Zs as m,ks as n,is as o,Ss as p,Ns as q,_s as r,uo as s,xs as t,cs as u,As as v,Z1 as w,Hs as x,us as y,io as z};
