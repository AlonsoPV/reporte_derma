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
