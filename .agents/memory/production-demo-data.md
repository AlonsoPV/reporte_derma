---
name: Carga demo en producción
description: Por qué la información demo debe cargarse selectivamente desde la app publicada.
---

Los datos demo cargados en desarrollo no están automáticamente disponibles en producción. Para esta clínica, conservar los registros existentes es un requisito; no copiar la base completa de desarrollo sobre producción.

**Why:** El usuario esperaba ver los datos demo del 8 de octubre de 2026 en producción y autorizó preparar una carga sin borrar datos. La copia completa de desarrollo reemplaza el contenido productivo.

**How to apply:** Para añadir datos demo a producción, usar una acción explícita, autenticada y selectiva en la app publicada. No usar el seed general ni una copia completa de la base. Distinguir entre preparar el cambio, publicarlo y ejecutar la carga; no afirmar que producción ya tiene datos antes de verificarlo.

El usuario también autorizó eliminar información demo en producción y desarrollo, incluidas las cuentas y médicos de prueba sin datos reales. Conservar datos no marcados como demo y el último administrador activo.

**Why:** El usuario eligió ambos entornos y la eliminación de cuentas, después de advertirle sobre datos reales y pérdida de accesos.

**How to apply:** No inferir que una atención manual sin marca demo es ficticia por pertenecer a un médico de prueba. Sus vínculos obligan a conservar ese médico y su cuenta. Mantener la auditoría de la eliminación y verificar cada entorno por separado.

El usuario decidió que las cuentas nuevas se creen inactivas y que el administrador asigne contraseñas individuales y las active desde Administración. Los perfiles que la clínica pide conservar dejan de ser candidatos a borrado de cuentas, aunque su identificador antiguo use un dominio demo.

**Why:** El usuario eligió configurar las claves desde Administración y posteriormente especificó el personal que se debe conservar.

**How to apply:** No activar cuentas nuevas ni reutilizar claves demo automáticamente. Proteger el personal designado durante la limpieza de cuentas sin impedir la eliminación de sus registros clínicos marcados como demo.

La limpieza pedida solo de pacientes debe conservar todas las cuentas y médicos. Una atención manual sin marca demo solo se puede incluir si el usuario confirma explícitamente ese registro como de prueba.

**Why:** El usuario distinguió el personal que se debe conservar de los pacientes ficticios y confirmó la eliminación de atenciones manuales identificadas.

**How to apply:** Usar selección por identificador y modo solo de pacientes; nunca deducir que todas las atenciones manuales son demo ni borrar cuentas como efecto secundario.
