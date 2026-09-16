/** Runs before hydration so a light-mode user never sees a dark flash. */
export function ThemeScript() {
  const js = `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
