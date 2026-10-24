(function(){'use strict';var aa=typeof Object.create=="function"?Object.create:function(a){function c(){}
c.prototype=a;return new c},ba=typeof Object.defineProperties=="function"?Object.defineProperty:function(a,c,b){if(a==Array.prototype||a==Object.prototype)return a;
a[c]=b.value;return a};
function ca(a){a=["object"==typeof globalThis&&globalThis,a,"object"==typeof window&&window,"object"==typeof self&&self,"object"==typeof global&&global];for(var c=0;c<a.length;++c){var b=a[c];if(b&&b.Math==Math)return b}throw Error("Cannot find global object");}
var da=ca(this);function p(a,c){if(c)a:{var b=da;a=a.split(".");for(var e=0;e<a.length-1;e++){var d=a[e];if(!(d in b))break a;b=b[d]}a=a[a.length-1];e=b[a];c=c(e);c!=e&&c!=null&&ba(b,a,{configurable:!0,writable:!0,value:c})}}
var ea;if(typeof Object.setPrototypeOf=="function")ea=Object.setPrototypeOf;else{var fa;a:{var ha={a:!0},ia={};try{ia.__proto__=ha;fa=ia.a;break a}catch(a){}fa=!1}ea=fa?function(a,c){a.__proto__=c;if(a.__proto__!==c)throw new TypeError(a+" is not extensible");return a}:null}var ja=ea;
function ka(a,c){a.prototype=aa(c.prototype);a.prototype.constructor=a;if(ja)ja(a,c);else for(var b in c)if(b!="prototype")if(Object.defineProperties){var e=Object.getOwnPropertyDescriptor(c,b);e&&Object.defineProperty(a,b,e)}else a[b]=c[b];a.nb=c.prototype}
var la=typeof Object.assign=="function"?Object.assign:function(a,c){if(a==null)throw new TypeError("No nullish arg");a=Object(a);for(var b=1;b<arguments.length;b++){var e=arguments[b];if(e)for(var d in e)Object.prototype.hasOwnProperty.call(e,d)&&(a[d]=e[d])}return a};
p("Object.assign",function(a){return a||la});
p("Number.isFinite",function(a){return a?a:function(c){return typeof c!=="number"?!1:!isNaN(c)&&c!==Infinity&&c!==-Infinity}});
p("Number.MAX_SAFE_INTEGER",function(){return 9007199254740991});
p("Number.MIN_SAFE_INTEGER",function(){return-9007199254740991});
p("Number.isNaN",function(a){return a?a:function(c){return typeof c==="number"&&isNaN(c)}});/*

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/
var oa=this||self;function pa(a){oa.setTimeout(function(){throw a;},0)}
;var qa,ra;a:{for(var sa=["CLOSURE_FLAGS"],ta=oa,ua=0;ua<sa.length;ua++)if(ta=ta[sa[ua]],ta==null){ra=null;break a}ra=ta}var va=ra&&ra[748402147];qa=va!=null?va:!0;var wa=void 0;var xa=typeof Symbol==="function"&&typeof Symbol()==="symbol";function ya(a,c,b){return typeof Symbol==="function"&&typeof Symbol()==="symbol"?(b===void 0?0:b)&&Symbol.for&&a?Symbol.for(a):a!=null?Symbol(a):Symbol():c}
var za=ya("jas",void 0,!0),Aa=ya(void 0,"0actk"),Ba=ya("m_m","lb",!0);var Ca={bb:{value:0,configurable:!0,writable:!0,enumerable:!1}},Da=Object.defineProperties,r=xa?za:"bb",Ea,Fa=[];w(Fa,7);Ea=Object.freeze(Fa);function Ga(a,c){xa||r in a||Da(a,Ca);a[r]|=c}
function w(a,c){xa||r in a||Da(a,Ca);a[r]=c}
;var Ha={};function x(a,c){return c===void 0?a.ya!==y&&!!(2&(a.P[r]|0)):!!(2&c)&&a.ya!==y}
var y={};var Ia=typeof oa.BigInt==="function"&&typeof oa.BigInt(0)==="bigint";var Ja=Number.MIN_SAFE_INTEGER.toString(),Ka=Ia?BigInt(Number.MIN_SAFE_INTEGER):void 0,Oa=Number.MAX_SAFE_INTEGER.toString(),Pa=Ia?BigInt(Number.MAX_SAFE_INTEGER):void 0;function Qa(a,c){if(a.length>c.length)return!1;if(a.length<c.length||a===c)return!0;for(var b=0;b<a.length;b++){var e=a[b],d=c[b];if(e>d)return!1;if(e<d)return!0}}
;function Ra(a){return a.displayName||a.name||"unknown type name"}
;function Sa(a){return a}
;function Ta(a,c,b,e){var d=e!==void 0;e=!!e;var f=[],g=a.length,k=4294967295,h=!1,l=!!(c&64),u=l?c&128?0:-1:void 0;if(!(c&1)){var n=g&&a[g-1];n!=null&&typeof n==="object"&&n.constructor===Object?(g--,k=g):n=void 0;if(l&&!(c&128)&&!d){h=!0;var q;k=((q=Ua)!=null?q:Sa)(k-u,u,a,n,void 0)+u}}c=void 0;for(d=0;d<g;d++)if(q=a[d],q!=null&&(q=b(q,e))!=null)if(l&&d>=k){var m=d-u,t=void 0;((t=c)!=null?t:c={})[m]=q}else f[d]=q;if(n)for(var v in n)a=n[v],a!=null&&(a=b(a,e))!=null&&(g=+v,d=void 0,l&&!Number.isNaN(g)&&
(d=g+u)<k?f[d]=a:(g=void 0,((g=c)!=null?g:c={})[v]=a));c&&(h?f.push(c):f[k]=c);return f}
function Va(a){switch(typeof a){case "number":return Number.isFinite(a)?a:""+a;case "bigint":return(Ia?a>=Ka&&a<=Pa:a[0]==="-"?Qa(a,Ja):Qa(a,Oa))?Number(a):""+a;case "boolean":return a?1:0;case "object":if(Array.isArray(a)){var c=a[r]|0;return a.length===0&&c&1?void 0:Ta(a,c,Va)}if(a!=null&&a[Ba]===Ha)return Wa(a);return}return a}
var Ua;function Wa(a){a=a.P;return Ta(a,a[r]|0,Va)}
;function Xa(a,c,b,e){e=e===void 0?0:e;if(a==null){var d=32;b?(a=[b],d|=128):a=[];c&&(d=d&-16760833|(c&1023)<<14)}else{if(!Array.isArray(a))throw Error("narr");d=a[r]|0;if(qa&&1&d)throw Error("rfarr");2048&d&&!(2&d)&&Ya();if(d&256)throw Error("farr");if(d&64)return(d|e)!==d&&w(a,d|e),a;if(b&&(d|=128,b!==a[0]))throw Error("mid");a:{b=a;d|=64;var f=b.length;if(f){var g=f-1,k=b[g];if(k!=null&&typeof k==="object"&&k.constructor===Object){c=d&128?0:-1;g-=c;if(g>=1024)throw Error("pvtlmt");for(var h in k)f=
+h,f<g&&(b[f+c]=k[h],delete k[h]);d=d&-16760833|(g&1023)<<14;break a}}if(c){h=Math.max(c,f-(d&128?0:-1));if(h>1024)throw Error("spvt");d=d&-16760833|(h&1023)<<14}}}w(a,d|64|e);return a}
function Ya(){if(qa)throw Error("carr");if(Aa!=null){var a;var c=(a=wa)!=null?a:wa={};a=c[Aa]||0;a>=5||(c[Aa]=a+1,c=Error(),c.__closure__error__context__984382||(c.__closure__error__context__984382={}),c.__closure__error__context__984382.severity="incident",pa(c))}}
;function Za(a,c){if(typeof a!=="object")return a;if(Array.isArray(a)){var b=a[r]|0;a.length===0&&b&1?a=void 0:b&2||(!c||4096&b||16&b?a=$a(a,b,!1,c&&!(b&16)):(Ga(a,34),b&4&&Object.freeze(a)));return a}if(a!=null&&a[Ba]===Ha){c=a.P;b=c[r]|0;if(!x(a,b)){if(b&2)var e=!0;else b&32&&!(b&4096)?(w(c,b|2),a.ya=y,e=!0):e=!1;e?(a=new a.constructor(c),a.cb=y):a=$a(c,b)}return a}}
function $a(a,c,b,e){e!=null||(e=!!(34&c));a=Ta(a,c,Za,e);e=32;b&&(e|=2);c=c&16769217|e;w(a,c);return a}
function ab(a){if(a.ya!==y)return!1;var c=a.P;c=$a(c,c[r]|0);Ga(c,2048);a.P=c;a.ya=void 0;a.cb=void 0;return!0}
function bb(a,c){c===void 0&&(c=a[r]|0);c&32&&!(c&4096)&&w(a,c|4096)}
;function z(a,c,b){this.P=Xa(a,c,b,2048)}
z.prototype.toJSON=function(){return Wa(this)};
z.prototype[Ba]=Ha;z.prototype.toString=function(){return this.P.toString()};
function cb(a,c){if(c==null)return new a;if(!Array.isArray(c))throw Error();if(Object.isFrozen(c)||Object.isSealed(c)||!Object.isExtensible(c))throw Error();Ga(c,32);return new a(c)}
;/*

 (The MIT License)

 Copyright (C) 2014 by Vitaly Puzrin

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.

 -----------------------------------------------------------------------------
 Ported from zlib, which is under the following license
 https://github.com/madler/zlib/blob/master/zlib.h

 zlib.h -- interface of the 'zlib' general purpose compression library
   version 1.2.8, April 28th, 2013
   Copyright (C) 1995-2013 Jean-loup Gailly and Mark Adler
   This software is provided 'as-is', without any express or implied
   warranty.  In no event will the authors be held liable for any damages
   arising from the use of this software.
   Permission is granted to anyone to use this software for any purpose,
   including commercial applications, and to alter it and redistribute it
   freely, subject to the following restrictions:
   1. The origin of this software must not be misrepresented; you must not
      claim that you wrote the original software. If you use this software
      in a product, an acknowledgment in the product documentation would be
      appreciated but is not required.
   2. Altered source versions must be plainly marked as such, and must not be
      misrepresented as being the original software.
   3. This notice may not be removed or altered from any source distribution.
   Jean-loup Gailly        Mark Adler
   jloup@gzip.org          madler@alumni.caltech.edu
   The data format used by the zlib library is described by RFCs (Request for
   Comments) 1950 to 1952 in the files http://tools.ietf.org/html/rfc1950
   (zlib format), rfc1951 (deflate format) and rfc1952 (gzip format).
*/
var C={},db=typeof Uint8Array!=="undefined"&&typeof Uint16Array!=="undefined"&&typeof Int32Array!=="undefined";C.assign=function(a){for(var c=Array.prototype.slice.call(arguments,1);c.length;){var b=c.shift();if(b){if(typeof b!=="object")throw new TypeError(b+"must be non-object");for(var e in b)Object.prototype.hasOwnProperty.call(b,e)&&(a[e]=b[e])}}return a};
C.Fa=function(a,c){if(a.length===c)return a;if(a.subarray)return a.subarray(0,c);a.length=c;return a};
var eb={ja:function(a,c,b,e,d){if(c.subarray&&a.subarray)a.set(c.subarray(b,b+e),d);else for(var f=0;f<e;f++)a[d+f]=c[b+f]},
Ka:function(a){var c,b;var e=b=0;for(c=a.length;e<c;e++)b+=a[e].length;var d=new Uint8Array(b);e=b=0;for(c=a.length;e<c;e++){var f=a[e];d.set(f,b);b+=f.length}return d}},fb={ja:function(a,c,b,e,d){for(var f=0;f<e;f++)a[d+f]=c[b+f]},
Ka:function(a){return[].concat.apply([],a)}};
C.jb=function(){db?(C.ia=Uint8Array,C.T=Uint16Array,C.Sa=Int32Array,C.assign(C,eb)):(C.ia=Array,C.T=Array,C.Sa=Array,C.assign(C,fb))};
C.jb();var gb=!0;try{new Uint8Array(1)}catch(a){gb=!1}
function hb(a){var c,b,e=a.length,d=0;for(c=0;c<e;c++){var f=a.charCodeAt(c);if((f&64512)===55296&&c+1<e){var g=a.charCodeAt(c+1);(g&64512)===56320&&(f=65536+(f-55296<<10)+(g-56320),c++)}d+=f<128?1:f<2048?2:f<65536?3:4}var k=new C.ia(d);for(c=b=0;b<d;c++)f=a.charCodeAt(c),(f&64512)===55296&&c+1<e&&(g=a.charCodeAt(c+1),(g&64512)===56320&&(f=65536+(f-55296<<10)+(g-56320),c++)),f<128?k[b++]=f:(f<2048?k[b++]=192|f>>>6:(f<65536?k[b++]=224|f>>>12:(k[b++]=240|f>>>18,k[b++]=128|f>>>12&63),k[b++]=128|f>>>
6&63),k[b++]=128|f&63);return k}
;var ib={};ib=function(a,c,b,e){var d=a&65535|0;a=a>>>16&65535|0;for(var f;b!==0;){f=b>2E3?2E3:b;b-=f;do d=d+c[e++]|0,a=a+d|0;while(--f);d%=65521;a%=65521}return d|a<<16|0};for(var D={},E,jb=[],kb=0;kb<256;kb++){E=kb;for(var lb=0;lb<8;lb++)E=E&1?3988292384^E>>>1:E>>>1;jb[kb]=E}D=function(a,c,b,e){b=e+b;for(a^=-1;e<b;e++)a=a>>>8^jb[(a^c[e])&255];return a^-1};var F={};F={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"};function H(a){for(var c=a.length;--c>=0;)a[c]=0}
var mb=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],nb=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],ob=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],pb=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],I=Array(576);H(I);var J=Array(60);H(J);var K=Array(512);H(K);var M=Array(256);H(M);var qb=Array(29);H(qb);var rb=Array(30);H(rb);function sb(a,c,b,e,d){this.Qa=a;this.Wa=c;this.Va=b;this.Ua=e;this.gb=d;this.Ma=a&&a.length}
var tb,ub,vb;function wb(a,c){this.Ja=a;this.na=0;this.ba=c}
function N(a,c){a.A[a.pending++]=c&255;a.A[a.pending++]=c>>>8&255}
function O(a,c,b){a.C>16-b?(a.H|=c<<a.C&65535,N(a,a.H),a.H=c>>16-a.C,a.C+=b-16):(a.H|=c<<a.C&65535,a.C+=b)}
function P(a,c,b){O(a,b[c*2],b[c*2+1])}
function xb(a,c){var b=0;do b|=a&1,a>>>=1,b<<=1;while(--c>0);return b>>>1}
function yb(a,c,b){var e=Array(16),d=0,f;for(f=1;f<=15;f++)e[f]=d=d+b[f-1]<<1;for(b=0;b<=c;b++)d=a[b*2+1],d!==0&&(a[b*2]=xb(e[d]++,d))}
function Bb(a){var c;for(c=0;c<286;c++)a.I[c*2]=0;for(c=0;c<30;c++)a.ea[c*2]=0;for(c=0;c<19;c++)a.D[c*2]=0;a.I[512]=1;a.Y=a.pa=0;a.M=a.matches=0}
function Cb(a){a.C>8?N(a,a.H):a.C>0&&(a.A[a.pending++]=a.H);a.H=0;a.C=0}
function Db(a,c,b){Cb(a);N(a,b);N(a,~b);C.ja(a.A,a.window,c,b,a.pending);a.pending+=b}
function Eb(a,c,b,e){var d=c*2,f=b*2;return a[d]<a[f]||a[d]===a[f]&&e[c]<=e[b]}
function Fb(a,c,b){for(var e=a.B[b],d=b<<1;d<=a.X;){d<a.X&&Eb(c,a.B[d+1],a.B[d],a.depth)&&d++;if(Eb(c,e,a.B[d],a.depth))break;a.B[b]=a.B[d];b=d;d<<=1}a.B[b]=e}
function Gb(a,c,b){var e=0;if(a.M!==0){do{var d=a.A[a.ra+e*2]<<8|a.A[a.ra+e*2+1];var f=a.A[a.Da+e];e++;if(d===0)P(a,f,c);else{var g=M[f];P(a,g+256+1,c);var k=mb[g];k!==0&&(f-=qb[g],O(a,f,k));d--;g=d<256?K[d]:K[256+(d>>>7)];P(a,g,b);k=nb[g];k!==0&&(d-=rb[g],O(a,d,k))}}while(e<a.M)}P(a,256,c)}
function Hb(a,c){var b=c.Ja,e=c.ba.Qa,d=c.ba.Ma,f=c.ba.Ua,g,k=-1;a.X=0;a.ka=573;for(g=0;g<f;g++)b[g*2]!==0?(a.B[++a.X]=k=g,a.depth[g]=0):b[g*2+1]=0;for(;a.X<2;){var h=a.B[++a.X]=k<2?++k:0;b[h*2]=1;a.depth[h]=0;a.Y--;d&&(a.pa-=e[h*2+1])}c.na=k;for(g=a.X>>1;g>=1;g--)Fb(a,b,g);h=f;do g=a.B[1],a.B[1]=a.B[a.X--],Fb(a,b,1),e=a.B[1],a.B[--a.ka]=g,a.B[--a.ka]=e,b[h*2]=b[g*2]+b[e*2],a.depth[h]=(a.depth[g]>=a.depth[e]?a.depth[g]:a.depth[e])+1,b[g*2+1]=b[e*2+1]=h,a.B[1]=h++,Fb(a,b,1);while(a.X>=2);a.B[--a.ka]=
a.B[1];g=c.Ja;h=c.na;e=c.ba.Qa;d=c.ba.Ma;f=c.ba.Wa;var l=c.ba.Va,u=c.ba.gb,n,q=0;for(n=0;n<=15;n++)a.U[n]=0;g[a.B[a.ka]*2+1]=0;for(c=a.ka+1;c<573;c++){var m=a.B[c];n=g[g[m*2+1]*2+1]+1;n>u&&(n=u,q++);g[m*2+1]=n;if(!(m>h)){a.U[n]++;var t=0;m>=l&&(t=f[m-l]);var v=g[m*2];a.Y+=v*(n+t);d&&(a.pa+=v*(e[m*2+1]+t))}}if(q!==0){do{for(n=u-1;a.U[n]===0;)n--;a.U[n]--;a.U[n+1]+=2;a.U[u]--;q-=2}while(q>0);for(n=u;n!==0;n--)for(m=a.U[n];m!==0;)e=a.B[--c],e>h||(g[e*2+1]!==n&&(a.Y+=(n-g[e*2+1])*g[e*2],g[e*2+1]=n),m--)}yb(b,
k,a.U)}
function Ib(a,c,b){var e,d=-1,f=c[1],g=0,k=7,h=4;f===0&&(k=138,h=3);c[(b+1)*2+1]=65535;for(e=0;e<=b;e++){var l=f;f=c[(e+1)*2+1];++g<k&&l===f||(g<h?a.D[l*2]+=g:l!==0?(l!==d&&a.D[l*2]++,a.D[32]++):g<=10?a.D[34]++:a.D[36]++,g=0,d=l,f===0?(k=138,h=3):l===f?(k=6,h=3):(k=7,h=4))}}
function Jb(a,c,b){var e,d=-1,f=c[1],g=0,k=7,h=4;f===0&&(k=138,h=3);for(e=0;e<=b;e++){var l=f;f=c[(e+1)*2+1];if(!(++g<k&&l===f)){if(g<h){do P(a,l,a.D);while(--g!==0)}else l!==0?(l!==d&&(P(a,l,a.D),g--),P(a,16,a.D),O(a,g-3,2)):g<=10?(P(a,17,a.D),O(a,g-3,3)):(P(a,18,a.D),O(a,g-11,7));g=0;d=l;f===0?(k=138,h=3):l===f?(k=6,h=3):(k=7,h=4)}}}
function Kb(a){var c=4093624447,b;for(b=0;b<=31;b++,c>>>=1)if(c&1&&a.I[b*2]!==0)return 0;if(a.I[18]!==0||a.I[20]!==0||a.I[26]!==0)return 1;for(b=32;b<256;b++)if(a.I[b*2]!==0)return 1;return 0}
var Lb=!1;function Q(a,c,b){a.A[a.ra+a.M*2]=c>>>8&255;a.A[a.ra+a.M*2+1]=c&255;a.A[a.Da+a.M]=b&255;a.M++;c===0?a.I[b*2]++:(a.matches++,c--,a.I[(M[b]+256+1)*2]++,a.ea[(c<256?K[c]:K[256+(c>>>7)])*2]++);return a.M===a.ta-1}
;function R(a,c){a.ua=F[c];return c}
function S(a){for(var c=a.length;--c>=0;)a[c]=0}
function T(a){var c=a.state,b=c.pending;b>a.u&&(b=a.u);b!==0&&(C.ja(a.output,c.A,c.va,b,a.oa),a.oa+=b,c.va+=b,a.Ga+=b,a.u-=b,c.pending-=b,c.pending===0&&(c.va=0))}
function U(a,c){var b=a.K>=0?a.K:-1,e=a.h-a.K,d=0;if(a.level>0){a.m.Ba===2&&(a.m.Ba=Kb(a));Hb(a,a.za);Hb(a,a.wa);Ib(a,a.I,a.za.na);Ib(a,a.ea,a.wa.na);Hb(a,a.Ia);for(d=18;d>=3&&a.D[pb[d]*2+1]===0;d--);a.Y+=3*(d+1)+5+5+4;var f=a.Y+3+7>>>3;var g=a.pa+3+7>>>3;g<=f&&(f=g)}else f=g=e+5;if(e+4<=f&&b!==-1)O(a,c?1:0,3),Db(a,b,e);else if(a.S===4||g===f)O(a,2+(c?1:0),3),Gb(a,I,J);else{O(a,4+(c?1:0),3);b=a.za.na+1;e=a.wa.na+1;d+=1;O(a,b-257,5);O(a,e-1,5);O(a,d-4,4);for(f=0;f<d;f++)O(a,a.D[pb[f]*2+1],3);Jb(a,
a.I,b-1);Jb(a,a.ea,e-1);Gb(a,a.I,a.ea)}Bb(a);c&&Cb(a);a.K=a.h;T(a.m)}
function V(a,c){a.A[a.pending++]=c}
function Mb(a,c){a.A[a.pending++]=c>>>8&255;a.A[a.pending++]=c&255}
function Nb(a,c){var b=a.Na,e=a.h,d=a.L,f=a.Oa,g=a.h>a.F-262?a.h-(a.F-262):0,k=a.window,h=a.ca,l=a.R,u=a.h+258,n=k[e+d-1],q=k[e+d];a.L>=a.La&&(b>>=2);f>a.i&&(f=a.i);do{var m=c;if(k[m+d]===q&&k[m+d-1]===n&&k[m]===k[e]&&k[++m]===k[e+1]){e+=2;for(m++;k[++e]===k[++m]&&k[++e]===k[++m]&&k[++e]===k[++m]&&k[++e]===k[++m]&&k[++e]===k[++m]&&k[++e]===k[++m]&&k[++e]===k[++m]&&k[++e]===k[++m]&&e<u;);m=258-(u-e);e=u-258;if(m>d){a.ma=c;d=m;if(m>=f)break;n=k[e+d-1];q=k[e+d]}}}while((c=l[c&h])>g&&--b!==0);return d<=
a.i?d:a.i}
function W(a){var c=a.F,b;do{var e=a.Ra-a.i-a.h;if(a.h>=c+(c-262)){C.ja(a.window,a.window,c,c,0);a.ma-=c;a.h-=c;a.K-=c;var d=b=a.xa;do{var f=a.head[--d];a.head[d]=f>=c?f-c:0}while(--b);d=b=c;do f=a.R[--d],a.R[d]=f>=c?f-c:0;while(--b);e+=c}if(a.m.G===0)break;d=a.m;b=a.window;f=a.h+a.i;var g=d.G;g>e&&(g=e);g===0?b=0:(d.G-=g,C.ja(b,d.input,d.ga,g,f),d.state.wrap===1?d.l=ib(d.l,b,g,f):d.state.wrap===2&&(d.l=D(d.l,b,g,f)),d.ga+=g,d.ha+=g,b=g);a.i+=b;if(a.i+a.J>=3)for(e=a.h-a.J,a.o=a.window[e],a.o=(a.o<<
a.W^a.window[e+1])&a.V;a.J&&!(a.o=(a.o<<a.W^a.window[e+3-1])&a.V,a.R[e&a.ca]=a.head[a.o],a.head[a.o]=e,e++,a.J--,a.i+a.J<3););}while(a.i<262&&a.m.G!==0)}
function Ob(a,c){for(var b;;){if(a.i<262){W(a);if(a.i<262&&c===0)return 1;if(a.i===0)break}b=0;a.i>=3&&(a.o=(a.o<<a.W^a.window[a.h+3-1])&a.V,b=a.R[a.h&a.ca]=a.head[a.o],a.head[a.o]=a.h);b!==0&&a.h-b<=a.F-262&&(a.v=Nb(a,b));if(a.v>=3)if(b=Q(a,a.h-a.ma,a.v-3),a.i-=a.v,a.v<=a.Ea&&a.i>=3){a.v--;do a.h++,a.o=(a.o<<a.W^a.window[a.h+3-1])&a.V,a.R[a.h&a.ca]=a.head[a.o],a.head[a.o]=a.h;while(--a.v!==0);a.h++}else a.h+=a.v,a.v=0,a.o=a.window[a.h],a.o=(a.o<<a.W^a.window[a.h+1])&a.V;else b=Q(a,0,a.window[a.h]),
a.i--,a.h++;if(b&&(U(a,!1),a.m.u===0))return 1}a.J=a.h<2?a.h:2;return c===4?(U(a,!0),a.m.u===0?3:4):a.M&&(U(a,!1),a.m.u===0)?1:2}
function X(a,c){for(var b,e;;){if(a.i<262){W(a);if(a.i<262&&c===0)return 1;if(a.i===0)break}b=0;a.i>=3&&(a.o=(a.o<<a.W^a.window[a.h+3-1])&a.V,b=a.R[a.h&a.ca]=a.head[a.o],a.head[a.o]=a.h);a.L=a.v;a.Pa=a.ma;a.v=2;b!==0&&a.L<a.Ea&&a.h-b<=a.F-262&&(a.v=Nb(a,b),a.v<=5&&(a.S===1||a.v===3&&a.h-a.ma>4096)&&(a.v=2));if(a.L>=3&&a.v<=a.L){e=a.h+a.i-3;b=Q(a,a.h-1-a.Pa,a.L-3);a.i-=a.L-1;a.L-=2;do++a.h<=e&&(a.o=(a.o<<a.W^a.window[a.h+3-1])&a.V,a.R[a.h&a.ca]=a.head[a.o],a.head[a.o]=a.h);while(--a.L!==0);a.fa=0;
a.v=2;a.h++;if(b&&(U(a,!1),a.m.u===0))return 1}else if(a.fa){if((b=Q(a,0,a.window[a.h-1]))&&U(a,!1),a.h++,a.i--,a.m.u===0)return 1}else a.fa=1,a.h++,a.i--}a.fa&&(Q(a,0,a.window[a.h-1]),a.fa=0);a.J=a.h<2?a.h:2;return c===4?(U(a,!0),a.m.u===0?3:4):a.M&&(U(a,!1),a.m.u===0)?1:2}
function Pb(a,c){for(var b,e,d,f=a.window;;){if(a.i<=258){W(a);if(a.i<=258&&c===0)return 1;if(a.i===0)break}a.v=0;if(a.i>=3&&a.h>0&&(e=a.h-1,b=f[e],b===f[++e]&&b===f[++e]&&b===f[++e])){for(d=a.h+258;b===f[++e]&&b===f[++e]&&b===f[++e]&&b===f[++e]&&b===f[++e]&&b===f[++e]&&b===f[++e]&&b===f[++e]&&e<d;);a.v=258-(d-e);a.v>a.i&&(a.v=a.i)}a.v>=3?(b=Q(a,1,a.v-3),a.i-=a.v,a.h+=a.v,a.v=0):(b=Q(a,0,a.window[a.h]),a.i--,a.h++);if(b&&(U(a,!1),a.m.u===0))return 1}a.J=0;return c===4?(U(a,!0),a.m.u===0?3:4):a.M&&
(U(a,!1),a.m.u===0)?1:2}
function Qb(a,c){for(var b;;){if(a.i===0&&(W(a),a.i===0)){if(c===0)return 1;break}a.v=0;b=Q(a,0,a.window[a.h]);a.i--;a.h++;if(b&&(U(a,!1),a.m.u===0))return 1}a.J=0;return c===4?(U(a,!0),a.m.u===0?3:4):a.M&&(U(a,!1),a.m.u===0)?1:2}
function Y(a,c,b,e,d){this.Ya=a;this.fb=c;this.ib=b;this.eb=e;this.Xa=d}
var Z;Z=[new Y(0,0,0,0,function(a,c){var b=65535;for(b>a.N-5&&(b=a.N-5);;){if(a.i<=1){W(a);if(a.i===0&&c===0)return 1;if(a.i===0)break}a.h+=a.i;a.i=0;var e=a.K+b;if(a.h===0||a.h>=e)if(a.i=a.h-e,a.h=e,U(a,!1),a.m.u===0)return 1;if(a.h-a.K>=a.F-262&&(U(a,!1),a.m.u===0))return 1}a.J=0;if(c===4)return U(a,!0),a.m.u===0?3:4;a.h>a.K&&U(a,!1);return 1}),
new Y(4,4,8,4,Ob),new Y(4,5,16,8,Ob),new Y(4,6,32,32,Ob),new Y(4,4,16,16,X),new Y(8,16,32,32,X),new Y(8,16,128,128,X),new Y(8,32,128,256,X),new Y(32,128,258,1024,X),new Y(32,258,258,4096,X)];
function Rb(){this.m=null;this.status=0;this.A=null;this.wrap=this.pending=this.va=this.N=0;this.j=null;this.O=0;this.method=8;this.la=-1;this.ca=this.Ha=this.F=0;this.window=null;this.Ra=0;this.head=this.R=null;this.Oa=this.La=this.S=this.level=this.Ea=this.Na=this.L=this.i=this.ma=this.h=this.fa=this.Pa=this.v=this.K=this.W=this.V=this.Ca=this.xa=this.o=0;this.I=new C.T(1146);this.ea=new C.T(122);this.D=new C.T(78);S(this.I);S(this.ea);S(this.D);this.Ia=this.wa=this.za=null;this.U=new C.T(16);this.B=
new C.T(573);S(this.B);this.ka=this.X=0;this.depth=new C.T(573);S(this.depth);this.C=this.H=this.J=this.matches=this.pa=this.Y=this.ra=this.M=this.ta=this.Da=0}
function Sb(a,c){if(!a||!a.state||c>5||c<0)return a?R(a,-2):-2;var b=a.state;if(!a.output||!a.input&&a.G!==0||b.status===666&&c!==4)return R(a,a.u===0?-5:-2);b.m=a;var e=b.la;b.la=c;if(b.status===42)if(b.wrap===2)a.l=0,V(b,31),V(b,139),V(b,8),b.j?(V(b,(b.j.text?1:0)+(b.j.aa?2:0)+(b.j.Z?4:0)+(b.j.name?8:0)+(b.j.Aa?16:0)),V(b,b.j.time&255),V(b,b.j.time>>8&255),V(b,b.j.time>>16&255),V(b,b.j.time>>24&255),V(b,b.level===9?2:b.S>=2||b.level<2?4:0),V(b,b.j.mb&255),b.j.Z&&b.j.Z.length&&(V(b,b.j.Z.length&
255),V(b,b.j.Z.length>>8&255)),b.j.aa&&(a.l=D(a.l,b.A,b.pending,0)),b.O=0,b.status=69):(V(b,0),V(b,0),V(b,0),V(b,0),V(b,0),V(b,b.level===9?2:b.S>=2||b.level<2?4:0),V(b,3),b.status=113);else{var d=8+(b.Ha-8<<4)<<8;d|=(b.S>=2||b.level<2?0:b.level<6?1:b.level===6?2:3)<<6;b.h!==0&&(d|=32);d+=31-d%31;b.status=113;Mb(b,d);b.h!==0&&(Mb(b,a.l>>>16),Mb(b,a.l&65535));a.l=1}if(b.status===69)if(b.j.Z){for(d=b.pending;b.O<(b.j.Z.length&65535)&&(b.pending!==b.N||(b.j.aa&&b.pending>d&&(a.l=D(a.l,b.A,b.pending-d,
d)),T(a),d=b.pending,b.pending!==b.N));)V(b,b.j.Z[b.O]&255),b.O++;b.j.aa&&b.pending>d&&(a.l=D(a.l,b.A,b.pending-d,d));b.O===b.j.Z.length&&(b.O=0,b.status=73)}else b.status=73;if(b.status===73)if(b.j.name){d=b.pending;do{if(b.pending===b.N&&(b.j.aa&&b.pending>d&&(a.l=D(a.l,b.A,b.pending-d,d)),T(a),d=b.pending,b.pending===b.N)){var f=1;break}f=b.O<b.j.name.length?b.j.name.charCodeAt(b.O++)&255:0;V(b,f)}while(f!==0);b.j.aa&&b.pending>d&&(a.l=D(a.l,b.A,b.pending-d,d));f===0&&(b.O=0,b.status=91)}else b.status=
91;if(b.status===91)if(b.j.Aa){d=b.pending;do{if(b.pending===b.N&&(b.j.aa&&b.pending>d&&(a.l=D(a.l,b.A,b.pending-d,d)),T(a),d=b.pending,b.pending===b.N)){f=1;break}f=b.O<b.j.Aa.length?b.j.Aa.charCodeAt(b.O++)&255:0;V(b,f)}while(f!==0);b.j.aa&&b.pending>d&&(a.l=D(a.l,b.A,b.pending-d,d));f===0&&(b.status=103)}else b.status=103;b.status===103&&(b.j.aa?(b.pending+2>b.N&&T(a),b.pending+2<=b.N&&(V(b,a.l&255),V(b,a.l>>8&255),a.l=0,b.status=113)):b.status=113);if(b.pending!==0){if(T(a),a.u===0)return b.la=
-1,0}else if(a.G===0&&(c<<1)-(c>4?9:0)<=(e<<1)-(e>4?9:0)&&c!==4)return R(a,-5);if(b.status===666&&a.G!==0)return R(a,-5);if(a.G!==0||b.i!==0||c!==0&&b.status!==666){e=b.S===2?Qb(b,c):b.S===3?Pb(b,c):Z[b.level].Xa(b,c);if(e===3||e===4)b.status=666;if(e===1||e===3)return a.u===0&&(b.la=-1),0;if(e===2&&(c===1?(O(b,2,3),P(b,256,I),b.C===16?(N(b,b.H),b.H=0,b.C=0):b.C>=8&&(b.A[b.pending++]=b.H&255,b.H>>=8,b.C-=8)):c!==5&&(O(b,0,3),Db(b,0,0),c===3&&(S(b.head),b.i===0&&(b.h=0,b.K=0,b.J=0))),T(a),a.u===0))return b.la=
-1,0}if(c!==4)return 0;if(b.wrap<=0)return 1;b.wrap===2?(V(b,a.l&255),V(b,a.l>>8&255),V(b,a.l>>16&255),V(b,a.l>>24&255),V(b,a.ha&255),V(b,a.ha>>8&255),V(b,a.ha>>16&255),V(b,a.ha>>24&255)):(Mb(b,a.l>>>16),Mb(b,a.l&65535));T(a);b.wrap>0&&(b.wrap=-b.wrap);return b.pending!==0?0:1}
;var Tb={};Tb=function(){this.input=null;this.ha=this.G=this.ga=0;this.output=null;this.Ga=this.u=this.oa=0;this.ua="";this.state=null;this.Ba=2;this.l=0};var Ub=Object.prototype.toString;
function Vb(a){if(!(this instanceof Vb))return new Vb(a);a=this.options=C.assign({level:-1,method:8,Ta:16384,da:15,hb:8,S:0,to:""},a||{});a.raw&&a.da>0?a.da=-a.da:a.Za&&a.da>0&&a.da<16&&(a.da+=16);this.err=0;this.ua="";this.ended=!1;this.qa=[];this.m=new Tb;this.m.u=0;var c=this.m;var b=a.level,e=a.method,d=a.da,f=a.hb,g=a.S;if(c){var k=1;b===-1&&(b=6);d<0?(k=0,d=-d):d>15&&(k=2,d-=16);if(f<1||f>9||e!==8||d<8||d>15||b<0||b>9||g<0||g>4)c=R(c,-2);else{d===8&&(d=9);var h=new Rb;c.state=h;h.m=c;h.wrap=
k;h.j=null;h.Ha=d;h.F=1<<h.Ha;h.ca=h.F-1;h.Ca=f+7;h.xa=1<<h.Ca;h.V=h.xa-1;h.W=~~((h.Ca+3-1)/3);h.window=new C.ia(h.F*2);h.head=new C.T(h.xa);h.R=new C.T(h.F);h.ta=1<<f+6;h.N=h.ta*4;h.A=new C.ia(h.N);h.ra=1*h.ta;h.Da=3*h.ta;h.level=b;h.S=g;h.method=e;if(c&&c.state){c.ha=c.Ga=0;c.Ba=2;b=c.state;b.pending=0;b.va=0;b.wrap<0&&(b.wrap=-b.wrap);b.status=b.wrap?42:113;c.l=b.wrap===2?0:1;b.la=0;if(!Lb){e=Array(16);for(f=g=0;f<28;f++)for(qb[f]=g,d=0;d<1<<mb[f];d++)M[g++]=f;M[g-1]=f;for(f=g=0;f<16;f++)for(rb[f]=
g,d=0;d<1<<nb[f];d++)K[g++]=f;for(g>>=7;f<30;f++)for(rb[f]=g<<7,d=0;d<1<<nb[f]-7;d++)K[256+g++]=f;for(d=0;d<=15;d++)e[d]=0;for(d=0;d<=143;)I[d*2+1]=8,d++,e[8]++;for(;d<=255;)I[d*2+1]=9,d++,e[9]++;for(;d<=279;)I[d*2+1]=7,d++,e[7]++;for(;d<=287;)I[d*2+1]=8,d++,e[8]++;yb(I,287,e);for(d=0;d<30;d++)J[d*2+1]=5,J[d*2]=xb(d,5);tb=new sb(I,mb,257,286,15);ub=new sb(J,nb,0,30,15);vb=new sb([],ob,0,19,7);Lb=!0}b.za=new wb(b.I,tb);b.wa=new wb(b.ea,ub);b.Ia=new wb(b.D,vb);b.H=0;b.C=0;Bb(b);b=0}else b=R(c,-2);b===
0&&(c=c.state,c.Ra=2*c.F,S(c.head),c.Ea=Z[c.level].fb,c.La=Z[c.level].Ya,c.Oa=Z[c.level].ib,c.Na=Z[c.level].eb,c.h=0,c.K=0,c.i=0,c.J=0,c.v=c.L=2,c.fa=0,c.o=0);c=b}}else c=-2;if(c!==0)throw Error(F[c]);a.ab&&(c=this.m)&&c.state&&c.state.wrap===2&&(c.state.j=a.ab);if(a.sa){var l;typeof a.sa==="string"?l=hb(a.sa):Ub.call(a.sa)==="[object ArrayBuffer]"?l=new Uint8Array(a.sa):l=a.sa;a=this.m;f=l;g=f.length;if(a&&a.state)if(l=a.state,c=l.wrap,c===2||c===1&&l.status!==42||l.i)c=-2;else{c===1&&(a.l=ib(a.l,
f,g,0));l.wrap=0;g>=l.F&&(c===0&&(S(l.head),l.h=0,l.K=0,l.J=0),b=new C.ia(l.F),C.ja(b,f,g-l.F,l.F,0),f=b,g=l.F);b=a.G;e=a.ga;d=a.input;a.G=g;a.ga=0;a.input=f;for(W(l);l.i>=3;){f=l.h;g=l.i-2;do l.o=(l.o<<l.W^l.window[f+3-1])&l.V,l.R[f&l.ca]=l.head[l.o],l.head[l.o]=f,f++;while(--g);l.h=f;l.i=2;W(l)}l.h+=l.i;l.K=l.h;l.J=l.i;l.i=0;l.v=l.L=2;l.fa=0;a.ga=e;a.input=d;a.G=b;l.wrap=c;c=0}else c=-2;if(c!==0)throw Error(F[c]);this.kb=!0}}
Vb.prototype.push=function(a,c){var b=this.m,e=this.options.Ta;if(this.ended)return!1;var d=c===~~c?c:c===!0?4:0;typeof a==="string"?b.input=hb(a):Ub.call(a)==="[object ArrayBuffer]"?b.input=new Uint8Array(a):b.input=a;b.ga=0;b.G=b.input.length;do{b.u===0&&(b.output=new C.ia(e),b.oa=0,b.u=e);a=Sb(b,d);if(a!==1&&a!==0)return Wb(this,a),this.ended=!0,!1;if(b.u===0||b.G===0&&(d===4||d===2))if(this.options.to==="string"){var f=C.Fa(b.output,b.oa);c=f;f=f.length;if(f<65537&&(c.subarray&&gb||!c.subarray))c=
String.fromCharCode.apply(null,C.Fa(c,f));else{for(var g="",k=0;k<f;k++)g+=String.fromCharCode(c[k]);c=g}this.qa.push(c)}else c=C.Fa(b.output,b.oa),this.qa.push(c)}while((b.G>0||b.u===0)&&a!==1);if(d===4)return(b=this.m)&&b.state?(e=b.state.status,e!==42&&e!==69&&e!==73&&e!==91&&e!==103&&e!==113&&e!==666?a=R(b,-2):(b.state=null,a=e===113?R(b,-3):0)):a=-2,Wb(this,a),this.ended=!0,a===0;d===2&&(Wb(this,0),b.u=0);return!0};
function Wb(a,c){c===0&&(a.result=a.options.to==="string"?a.qa.join(""):C.Ka(a.qa));a.qa=[];a.err=c;a.ua=a.m.ua}
;function Xb(a){this.P=Xa(a,500,void 0,2048)}
ka(Xb,z);function Yb(a){this.P=Xa(a,void 0,void 0,2048)}
ka(Yb,z);var Zb=typeof TextEncoder!=="undefined"?new TextEncoder:null,$b=Zb?function(a){return Zb.encode(a)}:function(a){for(var c=[],b=0,e=0;e<a.length;e++){var d=a.charCodeAt(e);
d<128?c[b++]=d:(d<2048?c[b++]=d>>6|192:((d&64512)==55296&&e+1<a.length&&(a.charCodeAt(e+1)&64512)==56320?(d=65536+((d&1023)<<10)+(a.charCodeAt(++e)&1023),c[b++]=d>>18|240,c[b++]=d>>12&63|128):c[b++]=d>>12|224,c[b++]=d>>6&63|128),c[b++]=d&63|128)}a=new Uint8Array(c.length);for(b=0;b<a.length;b++)a[b]=c[b];return a};self.addEventListener("message",function(a){var c=a.data;if(c.op==="gelBatchToSerialize"){var b=c.clientEvents;a=c.key;c=cb(Yb,c.batchRequest);for(var e=0;e<b.length;e++){var d=c,f=cb(Xb,b[e]),g=d;d=f;var k=Xb;f=g;if(!ab(f)&&x(f,f.P[r]|0))throw Error();f=g.P;var h=g,l=f,u=f[r]|0,n=k;g=x(h,u)?1:2;g===2&&ab(h)&&(l=h.P,u=l[r]|0);a:{var q=l.length-1;if(q<0)h=void 0;else if(2>=q)if(h=l[q],h!=null&&typeof h==="object"&&h.constructor===Object)h=h[3];else{if(2!==q){h=void 0;break a}}else h=l[2]}q=Array.isArray(h)?
h:Ea;var m=q===Ea?7:q[r]|0;h=m;2&u&&(h|=2);var t=h|=1;if(h=!(4&t)){var v=q,G=u,A=!!(2&t);A&&(G|=2);for(var L=!A,La=!0,ma=0,Ma=0;ma<v.length;ma++){var B=v[ma];var na=n,zb=G;if(B==null||B[Ba]!==Ha)if(Array.isArray(B)){var Ab=B[r]|0;var Na=Ab|zb&32;Na|=zb&2;Na!==Ab&&w(B,Na);B=new na(B)}else B=void 0;B instanceof n&&(A||(na=x(B),L&&(L=!na),La&&(La=na)),v[Ma++]=B)}Ma<ma&&(v.length=Ma);t|=4;t=La?t&-4097:t|4096;t=L?t|8:t&-9}t!==m&&(w(q,t),2&t&&Object.freeze(q));m=t;t=u;u=h;h=m;if((v=!!(2&m)&&!!(4&m)||!!(256&
m))&&g===2){q=Array.prototype.slice.call(q);h=0;m=2&t?m|2:m&-3;m&=-273;a:{n=void 0;v=l;G=q;A=v.length-1;if(A>=0&&2>=A&&(L=v[A],L!=null&&typeof L==="object"&&L.constructor===Object)){L[3]=G;break a}2<=A?v[2]=G:G!==void 0&&(A=((n=t)!=null?n:t=v[r]|0)>>14&1023||536870912,3>=A?G!=null&&(n={},v[A+-1]=(n[3]=G,n)):v[2]=G)}v=!1}v||(g===1||(g!==4?0:2&m||!(16&m)&&32&t)?(m|=!q.length||u&&!(4096&m)||32&t&&!(4096&m||16&m)?2:256,m!==h&&w(q,m),Object.freeze(q)):m!==h&&w(q,m));2&m||!(4096&m||16&m)||bb(l,t);g=q;if(d!=
null){if(!(d instanceof k))throw Error("Expected instanceof "+Ra(k)+" but got "+(d&&Ra(d.constructor)));}else d=new k;g.push(d);u=k=g===Ea?7:g[r]|0;(d=x(d))?(k&=-9,g.length===1&&(k&=-4097)):k|=4096;k!==u&&w(g,k);d||bb(f)}b=JSON.stringify(Wa(c));self.postMessage({op:"serializedGelBatch",serializedBatch:b,key:a})}else if(c.op==="gelBatchToGzip"){a=c.key;b=$b(c.serializedBatch);c=new Vb({Za:!0});c.push(b,!0);if(c.err)throw c.ua||F[c.err];self.postMessage({op:"gzippedGelBatch",gzippedBatch:c.result,key:a})}});}).call(this);
