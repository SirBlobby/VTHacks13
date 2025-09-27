// Allow importing CSS files for side-effects (global CSS) and CSS modules
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';
declare module '*.module.css';
declare module '*.module.scss';
declare module '*.module.sass';
declare module '*.module.less';

// You can add more specific typings if you want to type CSS modules:
// declare module '*.module.css' {
//   const classes: { readonly [key: string]: string };
//   export default classes;
// }
