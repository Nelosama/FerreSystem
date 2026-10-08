# Documentación de FerreSystem

El único documento vigente de continuidad, bitácora, pendientes, hallazgos QA y estado de correcciones es **[CONTEXTO_MAESTRO.md](CONTEXTO_MAESTRO.md)**.

Leer primero hasta **FIN DEL CONTEXTO VIGENTE**. La sección **8A** mantiene el registro trazable de auditorías (FUNC, SEC, TECH, SOS y antecedentes QA) con estado por hallazgo, prioridad y evidencia de cierre. La sección 5 conserva los pendientes E01–E15; la sección 8, la bitácora cronológica.

Los otros documentos de `docs/` son **referencias históricas o propuestas**. Sus listas no deben usarse como estado actual ni actualizarse en paralelo. El anexo histórico del contexto maestro conserva 20 documentos anteriores. Los antiguos reportes QA de la raíz (`QA_REPORT.md` y `QA-REPORT.md`) fueron retirados tras consolidar sus antecedentes y siguen recuperables en el historial de Git.

Al completar una corrección, actualizar el ID correspondiente en el contexto maestro con fecha, commit/PR, pruebas ejecutadas y estado real. No confundir pruebas aprobadas con despliegue o aceptación de negocio.
