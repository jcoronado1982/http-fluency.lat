export default function PracticeErrorState({ moduleDisabled, detail }) {
  return (
    <div className="arcadeStatePanel">
      <h2 className="arcadeStateTitle">No se pudo cargar Pronoun Practice</h2>
      <p className="arcadeStateMessage">
        {moduleDisabled
          ? 'El backend actual no tiene el modulo pronoun_practice habilitado.'
          : 'La historia o sus episodios no estan disponibles en esta instancia.'}
      </p>
      <p className="arcadeStateDetail">{detail}</p>
      <button type="button" className="btnPrimary" onClick={() => window.location.reload()}>
        Reintentar
      </button>
    </div>
  );
}
